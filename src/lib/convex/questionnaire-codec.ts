import { defaultChoiceOptions, defaultPrompt, text } from '#/lib/questionnaire/factory'
import type {
  ChoiceLayout,
  ChoiceOption,
  ChoicePrompt,
  LocalizedText,
  Question,
  Questionnaire,
} from '#/lib/questionnaire/types'
import { stripSystemFields, stripSystemFieldsAll } from './rows'

/**
 * A choice experiment keys two maps by text that comes straight from the
 * author's design cards: `levelLabels` by the raw level ("4 Hours\n5 Hours\n…")
 * and each card's `levels` by the column name ("Reliability_Range_A").
 *
 * Convex object field names must be non-control ASCII, so a discrete level
 * holding newlines — or any column written in Bangla — cannot be a field name.
 * Both maps therefore travel to the server as arrays of pairs and are turned
 * back into records here, where the rest of the app expects lookups by key.
 */

interface Pair<T> {
  key: string
  value: T
}

function toPairs<T>(record: Record<string, T>): Pair<T>[] {
  return Object.entries(record).map(([key, value]) => ({ key, value }))
}

function fromPairs<T>(pairs: Pair<T>[] | Record<string, T> | undefined): Record<string, T> {
  if (!pairs) return {}
  // Tolerates rows written before this encoding existed.
  if (!Array.isArray(pairs)) return pairs
  return Object.fromEntries(pairs.map(({ key, value }) => [key, value]))
}

/**
 * Rows saved before a block could ask several questions hold one `prompt`
 * and, for the profile layout, its `choiceOptions`. They become one prompt
 * with the same wording and answers.
 */
function legacyPrompts(question: Record<string, unknown>, layout: ChoiceLayout): ChoicePrompt[] {
  const prompt = defaultPrompt(layout)
  const wording = question.prompt as LocalizedText | undefined
  const options = question.choiceOptions as ChoiceOption[] | undefined
  return [
    {
      ...prompt,
      text: wording ?? prompt.text,
      options: options && options.length > 0 ? options : defaultChoiceOptions(),
    },
  ]
}

/** Fields added to choice experiments after the first surveys were saved. */
function choiceDefaults(question: Record<string, unknown>) {
  const layout = (question.layout as ChoiceLayout | undefined) ?? 'alternatives'
  const prompts = question.prompts as ChoicePrompt[] | undefined
  return {
    layout,
    attributeHeader: question.attributeHeader ?? text('Attributes', 'বৈশিষ্ট্যসমূহ'),
    referenceColumns: question.referenceColumns ?? [],
    drawMode: question.drawMode ?? 'random',
    prompts: prompts && prompts.length > 0 ? prompts : legacyPrompts(question, layout),
  }
}

/** The single-prompt fields of older rows, which the app no longer carries. */
function withoutLegacyFields(question: Record<string, unknown>): Record<string, unknown> {
  const { prompt: _prompt, choiceOptions: _options, ...rest } = question
  return rest
}

function encodeQuestion(question: Question): unknown {
  if (question.type !== 'choice_experiment') return question
  const raw = question as unknown as Record<string, unknown>
  return {
    ...withoutLegacyFields(raw),
    ...choiceDefaults(raw),
    levelLabels: toPairs(question.levelLabels),
    cards: question.cards.map((card) => ({ set: card.set, levels: toPairs(card.levels) })),
  }
}

function decodeQuestion(question: Record<string, unknown>): Question {
  if (question.type !== 'choice_experiment') return question as unknown as Question
  const cards = (question.cards as { set: number; levels: unknown }[]) ?? []
  return {
    ...withoutLegacyFields(question),
    ...choiceDefaults(question),
    levelLabels: fromPairs(question.levelLabels as Pair<LocalizedText>[]),
    cards: cards.map((card) => ({
      set: card.set,
      levels: fromPairs(card.levels as Pair<string>[]),
    })),
  } as unknown as Question
}

/** App shape -> the shape the Convex validators accept. */
export function encodeQuestionnaire(questionnaire: Questionnaire): Record<string, unknown> {
  return { ...questionnaire, questions: questionnaire.questions.map(encodeQuestion) }
}

/** Convex row -> app shape, with the system fields removed. */
export function decodeQuestionnaire(row: unknown): Questionnaire | null | undefined {
  const stripped = stripSystemFields<Record<string, unknown>>(row as never)
  if (!stripped) return stripped as null | undefined
  const questions = (stripped.questions as Record<string, unknown>[]) ?? []
  return { ...stripped, questions: questions.map(decodeQuestion) } as unknown as Questionnaire
}

export function decodeQuestionnaires(rows: unknown): Questionnaire[] | undefined {
  const stripped = stripSystemFieldsAll<Record<string, unknown>>(rows as never)
  return stripped?.map((row) => decodeQuestionnaire(row) as Questionnaire)
}
