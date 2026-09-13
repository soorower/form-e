import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { lang } from './validators'

/** "ACBUS-" + 7 -> "ACBUS-007". Mirrors formatSurveyNumber in the client. */
function formatSurveyNumber(prefix: string, serial: number): string {
  return `${prefix}${String(Math.max(0, serial)).padStart(3, '0')}`
}

async function highestSerial(
  ctx: { db: any },
  questionnaireId: string,
): Promise<number> {
  const last = await ctx.db
    .query('responses')
    .withIndex('by_serial', (q: any) => q.eq('questionnaireId', questionnaireId))
    .order('desc')
    .first()
  return last?.serial ?? 0
}

export const listBySurvey = query({
  args: { questionnaireId: v.string() },
  handler: async (ctx, { questionnaireId }) => {
    const rows = await ctx.db
      .query('responses')
      .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', questionnaireId))
      .collect()
    return rows.sort((a, b) => a.serial - b.serial || a.submittedAt - b.submittedAt)
  },
})

/** Every response across every survey, for the dashboard's team totals. */
export const listAll = query({
  args: {},
  handler: async (ctx) => ctx.db.query('responses').collect(),
})

/** The number the next response on this survey will get, shown before submitting. */
export const nextSerial = query({
  args: { questionnaireId: v.string() },
  handler: async (ctx, { questionnaireId }) =>
    (await highestSerial(ctx, questionnaireId)) + 1,
})

/**
 * Records one response. The serial is assigned here rather than on the tablet,
 * so survey numbers are unique across every device collecting this survey.
 * Convex retries the whole mutation on a write conflict, so two tablets
 * submitting at the same moment cannot receive the same number.
 */
export const submit = mutation({
  args: {
    id: v.string(),
    questionnaireId: v.string(),
    enumerator: v.string(),
    language: lang,
    answers: v.any(),
  },
  handler: async (ctx, args) => {
    const duplicate = await ctx.db
      .query('responses')
      .withIndex('by_app_id', (q) => q.eq('id', args.id))
      .unique()
    if (duplicate) return { serial: duplicate.serial, surveyNumber: duplicate.surveyNumber }

    const questionnaire = await ctx.db
      .query('questionnaires')
      .withIndex('by_app_id', (q) => q.eq('id', args.questionnaireId))
      .unique()
    const serial = (await highestSerial(ctx, args.questionnaireId)) + 1
    const surveyNumber = formatSurveyNumber(questionnaire?.surveyCodePrefix ?? '', serial)

    await ctx.db.insert('responses', {
      ...args,
      serial,
      surveyNumber,
      submittedAt: Date.now(),
    })
    return { serial, surveyNumber }
  },
})

/** Bulk upload used once when moving this browser's saved responses to the server. */
export const importMany = mutation({
  args: {
    responses: v.array(
      v.object({
        id: v.string(),
        questionnaireId: v.string(),
        serial: v.number(),
        surveyNumber: v.string(),
        enumerator: v.string(),
        language: lang,
        answers: v.any(),
        submittedAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, { responses }) => {
    let imported = 0
    for (const response of responses) {
      const existing = await ctx.db
        .query('responses')
        .withIndex('by_app_id', (q) => q.eq('id', response.id))
        .unique()
      if (existing) continue
      await ctx.db.insert('responses', response)
      imported += 1
    }
    return imported
  },
})

/**
 * How many times each design card has been shown, per choice-experiment
 * question, across every response to this survey. The tablet uses it to draw
 * the least-shown cards next ("balanced" mode), so exposure evens out the way
 * a pre-allocated frequency sheet would.
 */
export const cardExposure = query({
  args: { questionnaireId: v.string() },
  handler: async (ctx, { questionnaireId }) => {
    const rows = await ctx.db
      .query('responses')
      .withIndex('by_questionnaire', (q) => q.eq('questionnaireId', questionnaireId))
      .collect()
    const counts = new Map<string, { questionId: string; set: number; count: number }>()
    for (const row of rows) {
      const answers = row.answers as Record<string, unknown> | null | undefined
      if (!answers || typeof answers !== 'object') continue
      for (const [questionId, value] of Object.entries(answers)) {
        const scenarios = (value as { scenarios?: unknown } | null)?.scenarios
        if (!Array.isArray(scenarios)) continue
        for (const scenario of scenarios as { set?: unknown }[]) {
          if (typeof scenario?.set !== 'number') continue
          const key = `${questionId}:${scenario.set}`
          const entry = counts.get(key) ?? { questionId, set: scenario.set, count: 0 }
          entry.count += 1
          counts.set(key, entry)
        }
      }
    }
    return [...counts.values()]
  },
})
