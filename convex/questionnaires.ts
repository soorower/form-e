import { v } from 'convex/values'
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
  handler: async (ctx, { id }) => questionnaireByAppId(ctx, id),
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
 */
export const save = mutation({
  args: questionnaireFields,
  handler: async (ctx, questionnaire) => {
    const access = await requireBuilder(ctx)
    const existing = await questionnaireByAppId(ctx, questionnaire.id)
    const now = Date.now()
    if (existing) {
      assertAccess(access, existing)
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

/** Removes the questionnaire together with its responses and chat messages. */
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

    const messages = await ctx.db
      .query('messages')
      .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', id))
      .collect()
    for (const message of messages) await ctx.db.delete(message._id)
  },
})
