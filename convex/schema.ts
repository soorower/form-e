import { authTables } from '@convex-dev/auth/server'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { lang, questionnaireFields, responseFields } from './validators'

// Mirrors src/lib/questionnaire/types.ts. Cross-references use the app-level
// `id` string rather than a Convex _id, so survey URLs stay stable and data
// created offline on a tablet can be uploaded unchanged.

export default defineSchema({
  // users, authSessions, authAccounts, authRefreshTokens, ... (Convex Auth)
  ...authTables,

  questionnaires: defineTable(questionnaireFields).index('by_app_id', ['id']),

  responses: defineTable(responseFields)
    .index('by_app_id', ['id'])
    .index('by_questionnaire', ['questionnaireId'])
    .index('by_serial', ['questionnaireId', 'serial']),

  // Team chat: one room per questionnaire (= one team).
  messages: defineTable({
    questionnaireId: v.string(),
    author: v.string(),
    text: v.string(),
    sentAt: v.number(),
  }).index('by_questionnaire', ['questionnaireId', 'sentAt']),
})

export { lang }
