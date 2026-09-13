import type {
  AnswerValue,
  ChoiceExperimentAnswer,
  Question,
  TableAnswer,
  TableQuestion,
} from './types'

export function isTableAnswer(value: unknown): value is TableAnswer {
  return typeof value === 'object' && value !== null && Array.isArray((value as TableAnswer).rows)
}

export function isChoiceExperimentAnswer(value: unknown): value is ChoiceExperimentAnswer {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as ChoiceExperimentAnswer).scenarios)
  )
}

/**
 * Make sure every fixed row from the question is present, in question order,
 * followed by any rows the respondent added themselves.
 */
export function normalizeTableAnswer(
  question: TableQuestion,
  value: AnswerValue | undefined,
): TableAnswer {
  const existing = isTableAnswer(value) ? value.rows : []
  const byId = new Map(existing.map((row) => [row.id, row]))
  const fixedIds = new Set(question.rows.map((row) => row.id))
  const fixed = question.rows.map((row) => byId.get(row.id) ?? { id: row.id, cells: {} })
  const added = existing.filter((row) => !fixedIds.has(row.id))
  return { rows: [...fixed, ...added] }
}

export function isAnswered(question: Question, value: AnswerValue | undefined): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  if (question.type === 'choice_experiment') {
    return (
      isChoiceExperimentAnswer(value) &&
      value.scenarios.length > 0 &&
      value.scenarios.every((scenario) => scenario.choice !== '')
    )
  }
  if (question.type !== 'table') return false
  return (
    isTableAnswer(value) &&
    value.rows.some((row) =>
      Object.values(row.cells).some((cell) => cell !== '' && cell !== false),
    )
  )
}
