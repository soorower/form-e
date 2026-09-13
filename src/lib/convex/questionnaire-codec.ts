import { defaultChoiceOptions, text } from '#/lib/questionnaire/factory'
import type { LocalizedText, Question, Questionnaire } from '#/lib/questionnaire/types'
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

/** Fields added to choice experiments after the first surveys were saved. */
function choiceDefaults(question: Record<string, unknown>) {
  return {
    layout: question.layout ?? 'alternatives',
    attributeHeader: question.attributeHeader ?? text('Attributes', 'বৈশিষ্ট্যসমূহ'),
    referenceColumns: question.referenceColumns ?? [],
    choiceOptions: question.choiceOptions ?? defaultChoiceOptions(),
    drawMode: question.drawMode ?? 'random',
  }
}

function encodeQuestion(question: Question): unknown {
  if (question.type !== 'choice_experiment') return question
  return {
    ...question,
    ...choiceDefaults(question as unknown as Record<string, unknown>),
    levelLabels: toPairs(question.levelLabels),
    cards: question.cards.map((card) => ({ set: card.set, levels: toPairs(card.levels) })),
  }
}

function decodeQuestion(question: Record<string, unknown>): Question {
  if (question.type !== 'choice_experiment') return question as unknown as Question
  const cards = (question.cards as { set: number; levels: unknown }[]) ?? []
  return {
    ...question,
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
