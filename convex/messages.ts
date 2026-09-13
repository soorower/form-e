import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

const MAX_MESSAGE_LENGTH = 1000

/** Chat for one team, oldest first. Live: subscribers update as others send. */
export const list = query({
  args: { questionnaireId: v.string() },
  handler: async (ctx, { questionnaireId }) =>
    ctx.db
      .query('messages')
      .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', questionnaireId))
      .collect(),
})

export const send = mutation({
  args: { questionnaireId: v.string(), author: v.string(), text: v.string() },
  handler: async (ctx, { questionnaireId, author, text }) => {
    const trimmed = text.trim().slice(0, MAX_MESSAGE_LENGTH)
    const name = author.trim()
    if (!trimmed || !name) return null
    return ctx.db.insert('messages', {
      questionnaireId,
      author: name,
      text: trimmed,
      sentAt: Date.now(),
    })
  },
})
