import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import {
  accessFor,
  assertAccess,
  canBuild,
  canView,
  displayName,
  isApproved,
  normalizeEmail,
  questionnaireByAppId,
  requireApproved,
  roleOf,
  trustedEmail,
  viewerAccess,
} from './access'
import { rangeProblem, rangesOverlap } from './serials'

/**
 * Surveyor assignment: which approved surveyor accounts work on a survey.
 * Builders manage their own surveys' teams; admins manage every survey.
 */

/** Approved surveyor accounts a builder can put on a team. Empty for surveyors. */
export const surveyors = query({
  args: {},
  handler: async (ctx) => {
    const access = await viewerAccess(ctx)
    if (!access || !canBuild(access)) return []
    const users = await ctx.db.query('users').collect()
    const rows = []
    for (const user of users) {
      if (roleOf(user) !== 'surveyor' || !user.email) continue
      // The same rule as signing in: approved by the admin, or added to a
      // group under an address the account has proved.
      if (!isApproved(await accessFor(ctx, user))) continue
      rows.push({
        id: user._id,
        email: normalizeEmail(user.email),
        name: displayName(user),
        code: user.surveyorCode ?? null,
      })
    }
    return rows.sort((a, b) => (a.code ?? '').localeCompare(b.code ?? '') || a.name.localeCompare(b.name))
  },
})

/** The surveyors assigned to one survey, for its team (surveyors included). */
export const members = query({
  args: { questionnaireId: v.string() },
  handler: async (ctx, { questionnaireId }) => {
    const questionnaire = await questionnaireByAppId(ctx, questionnaireId)
    if (!questionnaire || !canView(await viewerAccess(ctx), questionnaire)) return []
    const assignments = await ctx.db
      .query('assignments')
      .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', questionnaireId))
      .collect()
    const rows = []
    for (const assignment of assignments) {
      // The same email may have a builder row and a surveyor row; the
      // surveyor one is the account that fills surveys.
      const accounts = await ctx.db
        .query('users')
        .withIndex('email', (q) => q.eq('email', assignment.email))
        .collect()
      const user = accounts.find((account) => roleOf(account) === 'surveyor') ?? accounts[0] ?? null
      rows.push({
        email: assignment.email,
        name: user ? displayName(user) : assignment.email,
        code: user?.surveyorCode ?? null,
        signedUp: user !== null,
        range:
          assignment.rangeStart !== undefined && assignment.rangeEnd !== undefined
            ? { start: assignment.rangeStart, end: assignment.rangeEnd }
            : null,
      })
    }
    return rows.sort((a, b) => (a.code ?? '').localeCompare(b.code ?? '') || a.name.localeCompare(b.name))
  },
})

export const assign = mutation({
  args: { questionnaireId: v.string(), email: v.string() },
  handler: async (ctx, { questionnaireId, email }) => {
    const access = await requireApproved(ctx)
    const questionnaire = await questionnaireByAppId(ctx, questionnaireId)
    if (!questionnaire) throw new ConvexError('That survey no longer exists.')
    assertAccess(access, questionnaire)
    const address = normalizeEmail(email)
    const accounts = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', address))
      .collect()
    if (!accounts.some((account) => roleOf(account) === 'surveyor')) {
      throw new ConvexError('That email is not an approved surveyor account.')
    }
    const existing = await ctx.db
      .query('assignments')
      .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', questionnaireId))
      .filter((q) => q.eq(q.field('email'), address))
      .unique()
    if (existing) return
    await ctx.db.insert('assignments', { questionnaireId, email: address, addedAt: Date.now() })
  },
})

export const unassign = mutation({
  args: { questionnaireId: v.string(), email: v.string() },
  handler: async (ctx, { questionnaireId, email }) => {
    const access = await requireApproved(ctx)
    const questionnaire = await questionnaireByAppId(ctx, questionnaireId)
    if (!questionnaire) return
    assertAccess(access, questionnaire)
    const address = normalizeEmail(email)
    const rows = await ctx.db
      .query('assignments')
      .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', questionnaireId))
      .filter((q) => q.eq(q.field('email'), address))
      .collect()
    for (const row of rows) await ctx.db.delete(row._id)
  },
})

/**
 * Gives a surveyor on a survey a block of survey numbers (Ikra 1–100,
 * Sorower 101–200), or takes it away with `range: null`. Their interviews
 * then take the lowest free number in it, and their paper forms are printed
 * for it. Blocks on one survey may not overlap; numbers already recorded
 * inside a new block simply stay taken.
 */
export const setRange = mutation({
  args: {
    questionnaireId: v.string(),
    email: v.string(),
    range: v.union(v.null(), v.object({ start: v.number(), end: v.number() })),
  },
  handler: async (ctx, { questionnaireId, email, range }) => {
    const access = await requireApproved(ctx)
    const questionnaire = await questionnaireByAppId(ctx, questionnaireId)
    if (!questionnaire) throw new ConvexError('That survey no longer exists.')
    assertAccess(access, questionnaire)
    const address = normalizeEmail(email)
    const assignments = await ctx.db
      .query('assignments')
      .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', questionnaireId))
      .collect()
    const mine = assignments.find((assignment) => assignment.email === address)
    if (!mine) throw new ConvexError('Assign this surveyor to the survey first.')
    if (range === null) {
      await ctx.db.patch(mine._id, { rangeStart: undefined, rangeEnd: undefined })
      return
    }
    const problem = rangeProblem(range)
    if (problem) throw new ConvexError(problem)
    for (const other of assignments) {
      if (other._id === mine._id || other.rangeStart === undefined || other.rangeEnd === undefined) {
        continue
      }
      if (rangesOverlap(range, { start: other.rangeStart, end: other.rangeEnd })) {
        throw new ConvexError(
          `Numbers ${other.rangeStart}–${other.rangeEnd} already belong to ${other.email}.`,
        )
      }
    }
    await ctx.db.patch(mine._id, { rangeStart: range.start, rangeEnd: range.end })
  },
})

/** The caller's own survey-number ranges, by survey: what a surveyor's paper forms are printed for. */
export const myRanges = query({
  args: {},
  handler: async (ctx) => {
    const access = await viewerAccess(ctx)
    const email = access && isApproved(access) ? trustedEmail(access.user) : ''
    if (!email) return []
    const assignments = await ctx.db
      .query('assignments')
      .withIndex('by_email', (q) => q.eq('email', email))
      .collect()
    return assignments.flatMap((assignment) =>
      assignment.rangeStart !== undefined && assignment.rangeEnd !== undefined
        ? [
            {
              questionnaireId: assignment.questionnaireId,
              start: assignment.rangeStart,
              end: assignment.rangeEnd,
            },
          ]
        : [],
    )
  },
})
