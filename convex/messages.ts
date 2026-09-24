import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import {
  assertView,
  canView,
  displayName,
  questionnaireByAppId,
  requireApproved,
  viewerAccess,
} from './access'

const MAX_MESSAGE_LENGTH = 1000

/**
 * Chat for one team, oldest first. Live: subscribers update as others send.
 * Only the survey's team (its builders, its assigned surveyors, admins) can
 * read it; anyone else gets an empty room rather than an error, since the
 * page around it is gated too.
 */
export const list = query({
  args: { questionnaireId: v.string() },
  handler: async (ctx, { questionnaireId }) => {
    const questionnaire = await questionnaireByAppId(ctx, questionnaireId)
    if (!questionnaire || !canView(await viewerAccess(ctx), questionnaire)) return []
    return ctx.db
      .query('messages')
      .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', questionnaireId))
      .collect()
  },
})

export const send = mutation({
  // `author` is ignored: the name is the signed-in account's, so nobody can
  // post as someone else. Still accepted so calls from older tablets validate.
  args: { questionnaireId: v.string(), author: v.optional(v.string()), text: v.string() },
  handler: async (ctx, { questionnaireId, text }) => {
    const access = await requireApproved(ctx)
    const questionnaire = await questionnaireByAppId(ctx, questionnaireId)
    if (!questionnaire) return null
    assertView(access, questionnaire)
    const trimmed = text.trim().slice(0, MAX_MESSAGE_LENGTH)
    const name = displayName(access.user)
    if (!trimmed) return null
    return ctx.db.insert('messages', {
      questionnaireId,
      author: name,
      text: trimmed,
      sentAt: Date.now(),
    })
  },
})
