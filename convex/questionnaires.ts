import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { questionnaireFields } from './validators'

/** Every questionnaire, newest edit first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query('questionnaires').collect()
    return all.sort((a, b) => b.updatedAt - a.updatedAt)
  },
})

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) =>
    ctx.db
      .query('questionnaires')
      .withIndex('by_app_id', (q) => q.eq('id', id))
      .unique(),
})

/** Insert or replace by app-level id. Returns the questionnaire as stored. */
export const save = mutation({
  args: questionnaireFields,
  handler: async (ctx, questionnaire) => {
    const existing = await ctx.db
      .query('questionnaires')
      .withIndex('by_app_id', (q) => q.eq('id', questionnaire.id))
      .unique()
    const next = { ...questionnaire, updatedAt: Date.now() }
    if (existing) {
      await ctx.db.patch(existing._id, next)
    } else {
      await ctx.db.insert('questionnaires', next)
    }
    return next
  },
})

/** Removes the questionnaire together with its responses and chat messages. */
export const remove = mutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const questionnaire = await ctx.db
      .query('questionnaires')
      .withIndex('by_app_id', (q) => q.eq('id', id))
      .unique()
    if (questionnaire) await ctx.db.delete(questionnaire._id)

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
