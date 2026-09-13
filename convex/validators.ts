import { v } from 'convex/values'

/**
 * Validators mirroring src/lib/questionnaire/types.ts. Kept in one place so
 * the schema and the mutation arguments cannot drift apart.
 */

export const lang = v.union(v.literal('en'), v.literal('bn'))

export const textStyle = v.object({
  bold: v.optional(v.boolean()),
  italic: v.optional(v.boolean()),
  underline: v.optional(v.boolean()),
  align: v.optional(
    v.union(v.literal('left'), v.literal('center'), v.literal('right'), v.literal('justify')),
  ),
})

export const localizedText = v.object({
  en: v.string(),
  bn: v.string(),
  style: v.optional(textStyle),
})

const option = v.object({ id: v.string(), label: localizedText })

const questionBase = {
  id: v.string(),
  label: localizedText,
  help: localizedText,
  required: v.boolean(),
}

export const question = v.union(
  v.object({
    ...questionBase,
    type: v.union(v.literal('short_text'), v.literal('long_text')),
    placeholder: localizedText,
  }),
  v.object({
    ...questionBase,
    type: v.literal('number'),
    min: v.optional(v.number()),
    max: v.optional(v.number()),
    unit: localizedText,
  }),
  v.object({
    ...questionBase,
    type: v.union(v.literal('date'), v.literal('time')),
  }),
  v.object({
    ...questionBase,
    type: v.union(v.literal('single_choice'), v.literal('multi_choice'), v.literal('dropdown')),
    options: v.array(option),
  }),
  v.object({
    ...questionBase,
    type: v.literal('table'),
    rows: v.array(option),
    columns: v.array(
      v.object({
        id: v.string(),
        label: localizedText,
        input: v.union(
          v.literal('text'),
          v.literal('number'),
          v.literal('checkbox'),
          v.literal('dropdown'),
        ),
        options: v.array(option),
      }),
    ),
    allowAddRows: v.boolean(),
  }),
  v.object({
    ...questionBase,
    type: v.literal('choice_experiment'),
    // Optional in the schema only because rows saved before these fields
    // existed have none of them. The client codec fills defaults on read and
    // always writes all five, so every row written by the app is complete.
    layout: v.optional(v.union(v.literal('alternatives'), v.literal('profile'))),
    attributeHeader: v.optional(localizedText),
    alternatives: v.array(v.object({ key: v.string(), label: localizedText })),
    attributes: v.array(v.object({ key: v.string(), label: localizedText })),
    referenceColumns: v.optional(
      v.array(v.object({ key: v.string(), label: localizedText, text: localizedText })),
    ),
    choiceOptions: v.optional(v.array(v.object({ key: v.string(), label: localizedText }))),
    drawMode: v.optional(v.union(v.literal('random'), v.literal('balanced'))),
    // Pairs, not records: these are keyed by text from the author's design
    // cards, which may contain newlines or Bangla, and Convex field names must
    // be non-control ASCII. See src/lib/convex/questionnaire-codec.ts.
    cards: v.array(
      v.object({
        set: v.number(),
        levels: v.array(v.object({ key: v.string(), value: v.string() })),
      }),
    ),
    levelLabels: v.array(v.object({ key: v.string(), value: localizedText })),
    scenariosPerRespondent: v.number(),
    prompt: localizedText,
  }),
)

/**
 * A questionnaire as the client sends it. `id` is the app-level id generated
 * in the browser: it appears in survey URLs and is what responses and chat
 * messages reference, so it stays stable no matter which device saved the row.
 */
export const questionnaireFields = {
  id: v.string(),
  title: localizedText,
  institution: localizedText,
  description: localizedText,
  logo: v.union(v.string(), v.null()),
  languages: v.array(lang),
  defaultLanguage: lang,
  questions: v.array(question),
  teamName: v.string(),
  responseTarget: v.number(),
  surveyCodePrefix: v.string(),
  enumerators: v.array(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
}

export const responseFields = {
  id: v.string(),
  questionnaireId: v.string(),
  serial: v.number(),
  surveyNumber: v.string(),
  enumerator: v.string(),
  language: lang,
  answers: v.any(),
  submittedAt: v.number(),
}
