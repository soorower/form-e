import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import {
  assertAccess,
  canAccess,
  questionnaireByAppId,
  requireBuilder,
  viewerAccess,
  visibleQuestionnaires,
} from './access'
import { questionnaireFields } from './validators'

/** The caller's questionnaires, newest edit first: every one for admins, own + groups' for builders, assigned ones for surveyors. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await visibleQuestionnaires(ctx, await viewerAccess(ctx))
    return rows.sort((a, b) => b.updatedAt - a.updatedAt)
  },
})

/** Public: the tablet fill page reads a survey by its URL without signing in. */
export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const questionnaire = await questionnaireByAppId(ctx, id)
    if (!questionnaire) return null
    // Who owns the survey is the team's business, not the respondent's.
    const { ownerId: _owner, groupId: _group, ...survey } = questionnaire
    return survey
  },
})

/**
 * The survey for the editor: null unless the caller may edit it (its owner,
 * its group, or an admin), so a builder who lands on another survey's URL
 * gets "no access" instead of an editor whose saves and responses fail.
 */
export const getEditable = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const questionnaire = await questionnaireByAppId(ctx, id)
    if (!questionnaire) return null
    return canAccess(await viewerAccess(ctx), questionnaire) ? questionnaire : null
  },
})

/**
 * Insert or replace by app-level id. Returns the questionnaire as stored.
 * A new survey belongs to its creator and lands in their group (the one it
 * names if they belong to it, else their first, else none). Owner and group
 * of an existing survey never change here: the group is set from the admin
 * panel, so whatever the editor sends for either is ignored.
 *
 * `baseUpdatedAt` is the `updatedAt` of the copy the editor started from.
 * When the stored row has moved on since (the admin set the target, the
 * dashboard changed the team, a second tab saved), the save is refused with
 * the current row in the error, and the editor merges its edits onto that
 * rather than overwriting the other change with a stale whole document.
 */
export const save = mutation({
  args: { ...questionnaireFields, baseUpdatedAt: v.optional(v.number()) },
  handler: async (ctx, { baseUpdatedAt, ...questionnaire }) => {
    const access = await requireBuilder(ctx)
    const existing = await questionnaireByAppId(ctx, questionnaire.id)
    const now = Date.now()
    if (existing) {
      assertAccess(access, existing)
      if (baseUpdatedAt !== undefined && existing.updatedAt !== baseUpdatedAt) {
        const { _id: _row, _creationTime: _created, ...current } = existing
        throw new ConvexError({ code: 'changed-elsewhere', current })
      }
      const next = {
        ...questionnaire,
        ownerId: existing.ownerId,
        groupId: existing.groupId,
        updatedAt: now,
      }
      await ctx.db.patch(existing._id, next)
      return next
    }
    const own = access.groups.find((group) => group.id === questionnaire.groupId)
    const groupId = own?.id ?? (access.admin ? questionnaire.groupId : access.groups[0]?.id)
    const next = { ...questionnaire, ownerId: access.user._id, groupId, updatedAt: now }
    await ctx.db.insert('questionnaires', next)
    return next
  },
})

/**
 * The team fields alone: what the dashboard's team editor changes. It used to
 * send the whole questionnaire from its own subscription, so a copy a few
 * hundred milliseconds stale could put back a block the builder had just
 * removed, or the other way round.
 */
export const setTeam = mutation({
  args: {
    id: v.string(),
    teamName: v.optional(v.string()),
    responseTarget: v.optional(v.number()),
    enumerators: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { id, teamName, responseTarget, enumerators }) => {
    const access = await requireBuilder(ctx)
    const questionnaire = await questionnaireByAppId(ctx, id)
    if (!questionnaire) throw new ConvexError('That survey no longer exists.')
    assertAccess(access, questionnaire)
    if (responseTarget !== undefined && (!Number.isFinite(responseTarget) || responseTarget < 0)) {
      throw new ConvexError('The target must be zero or more.')
    }
    await ctx.db.patch(questionnaire._id, {
      ...(teamName !== undefined ? { teamName: teamName.trim() } : {}),
      ...(responseTarget !== undefined ? { responseTarget: Math.floor(responseTarget) } : {}),
      ...(enumerators !== undefined
        ? { enumerators: enumerators.map((name) => name.trim()).filter(Boolean) }
        : {}),
      updatedAt: Date.now(),
    })
  },
})

/** Removes the questionnaire with its responses, card reservations, surveyor assignments, and chat messages. */
export const remove = mutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const access = await requireBuilder(ctx)
    const questionnaire = await questionnaireByAppId(ctx, id)
    if (!questionnaire) return
    assertAccess(access, questionnaire)
    await ctx.db.delete(questionnaire._id)

    const responses = await ctx.db
      .query('responses')
      .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', id))
      .collect()
    for (const response of responses) await ctx.db.delete(response._id)

    const summaries = await ctx.db
      .query('responseSummaries')
      .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', id))
      .collect()
    for (const summary of summaries) await ctx.db.delete(summary._id)

    const draws = await ctx.db
      .query('cardDraws')
      .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', id))
      .collect()
    for (const draw of draws) await ctx.db.delete(draw._id)

    // Otherwise the surveyors stay "assigned" to a survey that no longer
    // exists, and their access checks keep looking it up.
    const assignments = await ctx.db
      .query('assignments')
      .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', id))
      .collect()
    for (const assignment of assignments) await ctx.db.delete(assignment._id)

    const messages = await ctx.db
      .query('messages')
      .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', id))
      .collect()
    for (const message of messages) await ctx.db.delete(message._id)
  },
})
