import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import { internalMutation, type MutationCtx } from './_generated/server'
import { summarizeCards } from './cardBalance'

/**
 * The summary row of one response (see `responseSummaries` in the schema).
 * Every insert into `responses` goes through `recordSummary`, so the two
 * tables move together; `backfill` builds the rows for responses stored
 * before summaries existed.
 */
export async function recordSummary(
  ctx: MutationCtx,
  response: Pick<
    Doc<'responses'>,
    'id' | 'questionnaireId' | 'serial' | 'enumerator' | 'surveyorCode' | 'submittedAt' | 'answers'
  >,
): Promise<void> {
  const existing = await ctx.db
    .query('responseSummaries')
    .withIndex('by_response', (q) => q.eq('responseId', response.id))
    .first()
  if (existing) return
  await ctx.db.insert('responseSummaries', {
    responseId: response.id,
    questionnaireId: response.questionnaireId,
    serial: response.serial,
    enumerator: response.enumerator,
    ...(response.surveyorCode ? { surveyorCode: response.surveyorCode } : {}),
    submittedAt: response.submittedAt,
    cards: summarizeCards(response.answers),
  })
}

/**
 * One page of responses without a summary gets one. Run until `isDone`:
 *   npx convex run responseSummaries:backfill '{}'
 * Safe to run again; responses that already have a summary are skipped.
 */
export const backfill = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query('responses')
      .paginate({ numItems: 100, cursor: cursor ?? null })
    for (const response of page.page) await recordSummary(ctx, response)
    return { done: page.isDone, cursor: page.continueCursor, seen: page.page.length }
  },
})
