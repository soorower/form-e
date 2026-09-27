import { ConvexError, v } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import {
  accessFor,
  assertAccess,
  assertView,
  canAccess,
  canView,
  displayName,
  isApproved,
  questionnaireByAppId,
  requireApproved,
  requireBuilder,
  viewerAccess,
} from './access'
import { CARD_RESERVATION_MS } from './cardBalance'
import { formatSurveyNumber } from './serials'

// A share link lets anyone answer a survey on their own phone or computer,
// without an account. Two kinds:
//
// - Everyone on the survey's team (builders, the admin, its surveyors) has
//   one everyday link. An answer through it takes the sharer's next survey
//   number, as their own interview would, and is credited to them.
// - A builder or the admin can also make a link for one survey number (106
//   sent to one person). That number is set aside for it (`pinnedSerials`),
//   so no tablet takes it; the answer is recorded under it and credited to
//   the surveyor whose block holds it, or else to whoever made the link; and
//   the link then takes no more answers.
//
// Answers are marked `link: true`, so exports say "Link" in the Source
// column. The link carries a random token rather than the survey id with a
// name on it, so nobody can edit the address to credit someone else.

const TOKEN_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const TOKEN_LENGTH = 12

function newToken(): string {
  const bytes = new Uint8Array(TOKEN_LENGTH)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length]).join('')
}

async function surveyLinks(ctx: QueryCtx | MutationCtx, questionnaireId: string) {
  return ctx.db
    .query('shareLinks')
    .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', questionnaireId))
    .collect()
}

/**
 * Survey numbers set aside for a numbered link: the ones still open, and the
 * ones answered through one. Numbering skips them without counting on from
 * them (`pickSerial`), so 106 sent out after 104 leaves 105 for the tablet.
 * A numbered link turned off before anyone answered gives its number back.
 */
export async function pinnedSerials(
  ctx: QueryCtx | MutationCtx,
  questionnaireId: string,
): Promise<Set<number>> {
  const pinned = new Set<number>()
  for (const link of await surveyLinks(ctx, questionnaireId)) {
    if (link.serial !== undefined && (link.active || link.responseId !== undefined)) {
      pinned.add(link.serial)
    }
  }
  return pinned
}

export type OpenLink =
  | { ok: true; link: Doc<'shareLinks'>; questionnaire: Doc<'questionnaires'>; sharer: Doc<'users'> }
  | { ok: false; problem: string }

/**
 * The link behind a token, if it still takes answers: turned on, not already
 * answered (a numbered link takes one), its survey still there, and its
 * owner still on that survey's team. A surveyor taken off the survey, or an
 * account the admin revoked, stops their links working.
 */
export async function openShareLink(ctx: QueryCtx | MutationCtx, token: string): Promise<OpenLink> {
  const closed = { ok: false as const, problem: 'This survey link is not open for answers.' }
  const link = await ctx.db
    .query('shareLinks')
    .withIndex('by_token', (q) => q.eq('token', token))
    .unique()
  if (!link) return { ok: false, problem: 'This survey link does not exist. Check the address.' }
  if (link.responseId !== undefined) {
    return { ok: false, problem: 'This survey has already been answered through this link. Thank you!' }
  }
  if (!link.active) return closed
  const questionnaire = await questionnaireByAppId(ctx, link.questionnaireId)
  if (!questionnaire) return { ok: false, problem: 'This survey no longer exists.' }
  const sharer = await ctx.db.get(link.createdBy)
  if (!sharer) return closed
  const access = await accessFor(ctx, sharer)
  if (!isApproved(access) || !canView(access, questionnaire)) return closed
  return { ok: true, link, questionnaire, sharer }
}

/** Public: what the respondent's page needs to open the survey behind a link. */
export const resolve = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const open = await openShareLink(ctx, token)
    if (!open.ok) return { ok: false as const, problem: open.problem }
    return {
      ok: true as const,
      questionnaireId: open.questionnaire.id,
      sharedBy: displayName(open.sharer),
      // A numbered link's own number; null for an everyday link.
      serial: open.link.serial ?? null,
    }
  },
})

/** The caller's everyday link for one survey, or null before they made one. */
export const mine = query({
  args: { questionnaireId: v.string() },
  handler: async (ctx, { questionnaireId }) => {
    const access = await viewerAccess(ctx)
    if (!access || !isApproved(access)) return null
    const link = await everydayLink(ctx, access.user._id, questionnaireId)
    return link ? { token: link.token, active: link.active } : null
  },
})

async function everydayLink(
  ctx: QueryCtx | MutationCtx,
  userId: Doc<'users'>['_id'],
  questionnaireId: string,
) {
  const links = await ctx.db
    .query('shareLinks')
    .withIndex('by_creator', (q) => q.eq('createdBy', userId).eq('questionnaireId', questionnaireId))
    .collect()
  return links.find((link) => link.serial === undefined) ?? null
}

/**
 * Makes the caller's everyday link for a survey, or turns it back on: one
 * per person per survey, so everything they send out is the same address.
 * Anyone on the survey's team may: its builders, the admin, and the
 * surveyors assigned to it.
 */
export const create = mutation({
  args: { questionnaireId: v.string() },
  handler: async (ctx, { questionnaireId }) => {
    const access = await requireApproved(ctx)
    const questionnaire = await questionnaireByAppId(ctx, questionnaireId)
    if (!questionnaire) throw new ConvexError('This survey no longer exists.')
    assertView(access, questionnaire)
    const existing = await everydayLink(ctx, access.user._id, questionnaireId)
    if (existing) {
      if (!existing.active) await ctx.db.patch(existing._id, { active: true })
      return existing.token
    }
    const token = newToken()
    await ctx.db.insert('shareLinks', {
      token,
      questionnaireId,
      createdBy: access.user._id,
      createdAt: Date.now(),
      active: true,
    })
    return token
  },
})

/**
 * A link for one survey number, for builders and the admin: the number must
 * be free (not recorded, not held by an interview going on now). Asking again
 * for a number that already has an unanswered link returns that link.
 */
export const createNumbered = mutation({
  args: { questionnaireId: v.string(), serial: v.number() },
  handler: async (ctx, { questionnaireId, serial }) => {
    const access = await requireBuilder(ctx)
    const questionnaire = await questionnaireByAppId(ctx, questionnaireId)
    if (!questionnaire) throw new ConvexError('This survey no longer exists.')
    assertAccess(access, questionnaire)
    if (!Number.isInteger(serial) || serial < 1) {
      throw new ConvexError('Survey numbers are whole numbers from 1.')
    }
    const number = formatSurveyNumber(questionnaire.surveyCodePrefix, serial)

    const existing = (await surveyLinks(ctx, questionnaireId)).find((link) => link.serial === serial)
    if (existing?.responseId !== undefined) {
      throw new ConvexError(`${number} has already been answered through a link.`)
    }
    const recorded = await ctx.db
      .query('responses')
      .withIndex('by_serial', (q) => q.eq('questionnaireId', questionnaireId).eq('serial', serial))
      .first()
    if (recorded) throw new ConvexError(`${number} is already recorded.`)
    if (existing) {
      if (!existing.active) await ctx.db.patch(existing._id, { active: true })
      return existing.token
    }
    const now = Date.now()
    const draws = await ctx.db
      .query('cardDraws')
      .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', questionnaireId))
      .collect()
    if (draws.some((draw) => draw.serial === serial && now - draw.drawnAt <= CARD_RESERVATION_MS)) {
      throw new ConvexError(`${number} is being collected on a tablet right now.`)
    }

    const token = newToken()
    await ctx.db.insert('shareLinks', {
      token,
      questionnaireId,
      createdBy: access.user._id,
      createdAt: now,
      active: true,
      serial,
    })
    return token
  },
})

/** The survey's numbered links, newest first, for its builders and the admin. */
export const numbered = query({
  args: { questionnaireId: v.string() },
  handler: async (ctx, { questionnaireId }) => {
    const questionnaire = await questionnaireByAppId(ctx, questionnaireId)
    if (!questionnaire || !canAccess(await viewerAccess(ctx), questionnaire)) return []
    const rows = []
    for (const link of await surveyLinks(ctx, questionnaireId)) {
      if (link.serial === undefined) continue
      const creator = await ctx.db.get(link.createdBy)
      rows.push({
        token: link.token,
        serial: link.serial,
        surveyNumber: formatSurveyNumber(questionnaire.surveyCodePrefix, link.serial),
        active: link.active,
        answered: link.responseId !== undefined,
        createdBy: creator ? displayName(creator) : '',
        createdAt: link.createdAt,
      })
    }
    return rows.sort((a, b) => b.createdAt - a.createdAt)
  },
})

/**
 * Turns a link off (it then takes no answers, and a numbered one gives its
 * number back) or on again. Its maker may, and for a numbered link anyone who
 * can edit the survey.
 */
export const setActive = mutation({
  args: { token: v.string(), active: v.boolean() },
  handler: async (ctx, { token, active }) => {
    const access = await requireApproved(ctx)
    const link = await ctx.db
      .query('shareLinks')
      .withIndex('by_token', (q) => q.eq('token', token))
      .unique()
    if (!link) throw new ConvexError('That link no longer exists.')
    const questionnaire = await questionnaireByAppId(ctx, link.questionnaireId)
    const allowed =
      link.createdBy === access.user._id ||
      access.admin ||
      (link.serial !== undefined && !!questionnaire && canAccess(access, questionnaire))
    if (!allowed) throw new ConvexError('Only the person who made a link can turn it off.')
    if (active && link.serial !== undefined && link.responseId === undefined) {
      const recorded = await ctx.db
        .query('responses')
        .withIndex('by_serial', (q) =>
          q.eq('questionnaireId', link.questionnaireId).eq('serial', link.serial!),
        )
        .first()
      if (recorded) throw new ConvexError('That number has been recorded since; make a new link.')
    }
    await ctx.db.patch(link._id, { active })
  },
})
