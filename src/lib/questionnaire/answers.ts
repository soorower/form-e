import type {
  AnswerValue,
  ChoiceExperimentAnswer,
  ChoicePrompt,
  ChoiceScenarioAnswer,
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

/** The key chosen for an "Other" answer, stored alongside the typed text. */
export const OTHER_ANSWER = 'other'

/**
 * The answer recorded for one prompt of a scenario. Responses saved before a
 * block could ask several questions hold only `choice`, which answers the
 * first prompt.
 */
export function scenarioChoice(
  scenario: Pick<ChoiceScenarioAnswer, 'choice' | 'choices'>,
  prompt: Pick<ChoicePrompt, 'key'>,
  promptIndex: number,
): string {
  const stored = scenario.choices?.[prompt.key]
  if (stored !== undefined) return stored
  return promptIndex === 0 ? scenario.choice : ''
}

/**
 * The scenario with one prompt answered. `choice` mirrors the first prompt so
 * anything that reads the older single-answer shape keeps working.
 */
export function answerScenario(
  scenario: ChoiceScenarioAnswer,
  prompt: Pick<ChoicePrompt, 'key'>,
  promptIndex: number,
  value: string,
): ChoiceScenarioAnswer {
  return {
    ...scenario,
    choice: promptIndex === 0 ? value : scenario.choice,
    choices: { ...(scenario.choices ?? {}), [prompt.key]: value },
  }
}

/** The scenario with the free text of an "Other" answer set for one prompt. */
export function setScenarioOther(
  scenario: ChoiceScenarioAnswer,
  prompt: Pick<ChoicePrompt, 'key'>,
  value: string,
): ChoiceScenarioAnswer {
  return { ...scenario, other: { ...(scenario.other ?? {}), [prompt.key]: value } }
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
    if (!isChoiceExperimentAnswer(value) || value.scenarios.length === 0) return false
    const prompts = question.prompts.length > 0 ? question.prompts : [{ key: '' }]
    return value.scenarios.every((scenario) =>
      prompts.every((prompt, index) => scenarioChoice(scenario, prompt, index) !== ''),
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
