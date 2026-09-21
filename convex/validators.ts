import { v } from 'convex/values'

/**
 * Validators mirroring src/lib/questionnaire/types.ts. Kept in one place so
 * the schema and the mutation arguments cannot drift apart.
 */

export const lang = v.union(v.literal('en'), v.literal('bn'))

/**
 * What an approved account may do. A **builder** builds questionnaires,
 * previews and fills them, downloads responses, and runs several surveys. A
 * **surveyor** only fills the surveys assigned to them and follows their
 * team's progress and chat. `member` is the old name for builder and is
 * only still accepted so older rows keep validating.
 */
export const role = v.union(
  v.literal('admin'),
  v.literal('builder'),
  v.literal('surveyor'),
  v.literal('member'),
)

/**
 * Whether the admin has let this account in. New sign-ups have no status
 * (= pending) until the admin approves or rejects them on /admin.
 */
export const userStatus = v.union(
  v.literal('pending'),
  v.literal('approved'),
  v.literal('rejected'),
)

/**
 * A group is a set of people (by email) the admin lets build questionnaires
 * and run surveys. Nothing is possible until the admin approves the group.
 */
export const groupFields = {
  id: v.string(),
  name: v.string(),
  approved: v.boolean(),
  note: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
}

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

const choiceOption = v.object({ key: v.string(), label: localizedText })

const choicePrompt = v.object({
  key: v.string(),
  text: localizedText,
  answer: v.union(v.literal('alternative'), v.literal('options')),
  options: v.array(choiceOption),
  allowOther: v.boolean(),
})

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
    // always writes all of them, so every row written by the app is complete.
    layout: v.optional(v.union(v.literal('alternatives'), v.literal('profile'))),
    attributeHeader: v.optional(localizedText),
    alternatives: v.array(v.object({ key: v.string(), label: localizedText })),
    attributes: v.array(
      v.object({ key: v.string(), label: localizedText, group: v.optional(localizedText) }),
    ),
    referenceColumns: v.optional(
      v.array(v.object({ key: v.string(), label: localizedText, text: localizedText })),
    ),
    drawMode: v.optional(v.union(v.literal('random'), v.literal('balanced'))),
    // The questions under every scenario. Rows written before blocks could
    // ask several questions hold a single `prompt` and, for the profile
    // layout, its `choiceOptions`; the codec turns those into one prompt.
    prompts: v.optional(v.array(choicePrompt)),
    prompt: v.optional(localizedText),
    choiceOptions: v.optional(v.array(choiceOption)),
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
  // Who may see and edit this survey: its creator (`ownerId`, a users id,
  // set by the server on insert) and every member of its group (`groupId`,
  // set on insert to the creator's group and changed from the admin panel).
  // Rows saved before these existed have neither and are admin-only until
  // the admin assigns a group.
  ownerId: v.optional(v.string()),
  groupId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
}

export const responseFields = {
  id: v.string(),
  questionnaireId: v.string(),
  serial: v.number(),
  surveyNumber: v.string(),
  enumerator: v.string(),
  // Set by the server when a signed-in surveyor submits: their users id and
  // the code the admin gave them, so progress can be followed per person.
  surveyorId: v.optional(v.string()),
  surveyorCode: v.optional(v.string()),
  language: lang,
  answers: v.any(),
  submittedAt: v.number(),
}
