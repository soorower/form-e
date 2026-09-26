import { authTables } from '@convex-dev/auth/server'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { groupFields, lang, questionnaireFields, responseFields, role, userStatus } from './validators'

// Mirrors src/lib/questionnaire/types.ts. Cross-references use the app-level
// `id` string rather than a Convex _id, so survey URLs stay stable and data
// created offline on a tablet can be uploaded unchanged.

export default defineSchema({
  // authSessions, authAccounts, authRefreshTokens, ... (Convex Auth)
  ...authTables,

  // Convex Auth's users table plus `role` and `status`. The auth fields are repeated here
  // because a table can only be defined once; keep them in step with the
  // library's own definition.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(role),
    status: v.optional(userStatus),
    // Short code the admin gives a surveyor (e.g. S01), shown next to their name.
    surveyorCode: v.optional(v.string()),
  })
    .index('email', ['email'])
    .index('phone', ['phone']),

  // Who may build questionnaires and run surveys. Members are kept by email
  // so the admin can add someone before they have signed up.
  groups: defineTable(groupFields).index('by_app_id', ['id']),
  groupMembers: defineTable({
    groupId: v.string(),
    email: v.string(),
    addedAt: v.number(),
  })
    .index('by_group', ['groupId'])
    .index('by_email', ['email']),

  // Which surveyors work on which survey. A surveyor sees exactly the
  // surveys assigned here; builders and admins assign.
  assignments: defineTable({
    questionnaireId: v.string(),
    email: v.string(),
    addedAt: v.number(),
    // The block of survey numbers this surveyor collects (Ikra 1–100,
    // Sorower 101–200), both ends included; absent = no block of their own.
    // See convex/serials.ts.
    rangeStart: v.optional(v.number()),
    rangeEnd: v.optional(v.number()),
  })
    .index('by_questionnaire', ['questionnaireId'])
    .index('by_email', ['email']),

  questionnaires: defineTable(questionnaireFields)
    .index('by_app_id', ['id'])
    .index('by_group', ['groupId'])
    .index('by_owner', ['ownerId']),

  responses: defineTable(responseFields)
    .index('by_app_id', ['id'])
    .index('by_questionnaire', ['questionnaireId'])
    .index('by_serial', ['questionnaireId', 'serial']),

  // One small row per response: who collected it, when, and which cards it
  // showed. Progress, leaderboards, counts, and card balancing read these
  // instead of the full responses, so a 700-response survey stays far inside
  // Convex's per-query read limit. Written in the same mutation as the
  // response, so the two never disagree (convex/responseSummaries.ts).
  responseSummaries: defineTable({
    responseId: v.string(),
    questionnaireId: v.string(),
    serial: v.number(),
    enumerator: v.string(),
    surveyorCode: v.optional(v.string()),
    submittedAt: v.number(),
    cards: v.array(
      v.object({
        questionId: v.string(),
        sets: v.array(v.number()),
        planRow: v.optional(v.number()),
      }),
    ),
  })
    .index('by_questionnaire', ['questionnaireId'])
    .index('by_response', ['responseId']),

  // Cards handed to an interview that is still going on (balanced drawing, or
  // one row of the creator's scenario plan). `responses.drawCards` writes a
  // row per choice-experiment block, counts it as used so no other tablet
  // gets the same cards, and `responses.submit` removes it: from then on the
  // response itself is what counts.
  cardDraws: defineTable({
    questionnaireId: v.string(),
    responseId: v.string(),
    questionId: v.string(),
    sets: v.array(v.number()),
    // Which row of the block's scenario plan these cards came from, when the
    // block follows a plan. Absent on balanced draws.
    planRow: v.optional(v.number()),
    // The survey number held for this interview. Decided when the cards are,
    // because a planned block's row follows the number; `submit` then records
    // the response under it.
    serial: v.optional(v.number()),
    drawnAt: v.number(),
  })
    .index('by_questionnaire', ['questionnaireId'])
    .index('by_response', ['responseId']),

  // Team chat: one room per questionnaire (= one team).
  messages: defineTable({
    questionnaireId: v.string(),
    author: v.string(),
    text: v.string(),
    sentAt: v.number(),
  }).index('by_questionnaire', ['questionnaireId', 'sentAt']),
})

export { lang }
