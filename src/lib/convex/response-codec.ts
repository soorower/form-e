import { isChoiceExperimentAnswer, isTableAnswer } from '#/lib/questionnaire/answers'
import type { AnswerValue, SurveyResponse } from '#/lib/questionnaire/types'
import { fromPairs, toPairs } from './questionnaire-codec'

/**
 * A scenario answer snapshots the card's `levels` under the same column names
 * the questionnaire uses, and those may be written in Bangla. Convex refuses
 * such field names, so a survey whose cards saved fine (questionnaire-codec
 * sends them as pairs) could not record a single response.
 *
 * Here a map whose keys Convex accepts travels unchanged, so responses look
 * the way they always have; only a map with a refused key goes as pairs.
 * Reading accepts both, which also covers every response stored before this.
 */

const MAX_FIELD_NAME = 1024

/** Mirrors Convex's rule: non-empty printable ASCII, not starting with $ or _. */
export function isSafeFieldName(key: string): boolean {
  if (key.length === 0 || key.length > MAX_FIELD_NAME) return false
  if (key.startsWith('$') || key.startsWith('_')) return false
  for (let i = 0; i < key.length; i += 1) {
    const code = key.charCodeAt(i)
    if (code < 32 || code >= 127) return false
  }
  return true
}

function encodeRecord<T>(record: Record<string, T> | undefined) {
  if (!record) return record
  return Object.keys(record).every(isSafeFieldName) ? record : toPairs(record)
}

function encodeAnswer(value: AnswerValue): unknown {
  if (isChoiceExperimentAnswer(value)) {
    return {
      // The plan row travels as it is: a plain number the validators accept.
      ...(value.planRow === undefined ? {} : { planRow: value.planRow }),
      scenarios: value.scenarios.map(({ levels, choices, other, ...scenario }) => ({
        ...scenario,
        levels: encodeRecord(levels),
        ...(choices ? { choices: encodeRecord(choices) } : {}),
        ...(other ? { other: encodeRecord(other) } : {}),
      })),
    }
  }
  if (isTableAnswer(value)) {
    return { rows: value.rows.map((row) => ({ ...row, cells: encodeRecord(row.cells) })) }
  }
  return value
}

/** Answers in the shape `responses.submit` and `importMany` can store. */
export function encodeAnswers(answers: Record<string, AnswerValue>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(answers).map(([questionId, value]) => [questionId, encodeAnswer(value)]),
  )
}

function decodeAnswer(value: unknown): AnswerValue {
  if (isChoiceExperimentAnswer(value)) {
    return {
      ...(value.planRow === undefined ? {} : { planRow: value.planRow }),
      scenarios: value.scenarios.map(({ levels, choices, other, ...scenario }) => ({
        ...scenario,
        levels: fromPairs(levels),
        ...(choices ? { choices: fromPairs(choices) } : {}),
        ...(other ? { other: fromPairs(other) } : {}),
      })),
    }
  }
  if (isTableAnswer(value)) {
    return { rows: value.rows.map((row) => ({ ...row, cells: fromPairs(row.cells) })) }
  }
  return value as AnswerValue
}

/** A stored response with every map back as a record, whichever way it was sent. */
export function decodeResponse(response: SurveyResponse): SurveyResponse {
  const answers = (response.answers ?? {}) as Record<string, unknown>
  return {
    ...response,
    answers: Object.fromEntries(
      Object.entries(answers).map(([questionId, value]) => [questionId, decodeAnswer(value)]),
    ),
  }
}

export function decodeResponses(
  responses: SurveyResponse[] | undefined,
): SurveyResponse[] | undefined {
  return responses?.map(decodeResponse)
}
