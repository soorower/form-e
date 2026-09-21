import type {
  ChoiceExperimentQuestion,
  ChoiceLayout,
  ChoiceOption,
  ChoicePrompt,
  ChoicePromptAnswer,
  Lang,
  LocalizedText,
  Option,
  Question,
  QuestionType,
  Questionnaire,
  TableColumn,
} from './types'

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function text(en = '', bn = ''): LocalizedText {
  return { en, bn }
}

/** Text in the requested language, falling back to the other one when empty. */
export function pickText(value: LocalizedText, lang: Lang): string {
  return value[lang] || value[lang === 'en' ? 'bn' : 'en'] || ''
}

export const LANGUAGES: Lang[] = ['en', 'bn']

/**
 * Team member names as shown on the tablet: trimmed, blanks dropped, and
 * de-duplicated. Responses are attributed by name, so two members sharing one
 * name cannot be told apart anyway, and keeping both would give the leaderboard
 * and the name picker duplicate entries.
 */
export function activeEnumerators(questionnaire: Pick<Questionnaire, 'enumerators'>): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const raw of questionnaire.enumerators) {
    const name = raw.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

/** "ACBUS-" + 7 -> "ACBUS-007". Serials beyond 999 simply grow longer. */
export function formatSurveyNumber(prefix: string, serial: number): string {
  return `${prefix}${String(Math.max(0, serial)).padStart(3, '0')}`
}

export const LANGUAGE_LABELS: Record<Lang, string> = {
  en: 'English',
  bn: 'বাংলা',
}

export const LANGUAGE_SHORT: Record<Lang, string> = {
  en: 'EN',
  bn: 'বাং',
}

const BANGLA_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯']

/** Rewrites Western digits as Bangla digits: "12.5" -> "১২.৫". */
export function toBanglaDigits(value: string): string {
  return value.replace(/[0-9]/g, (digit) => BANGLA_DIGITS[Number(digit)])
}

/** A number in the digits of the given language, for question and scenario numbering. */
export function formatNumber(value: number, lang: Lang): string {
  const plain = String(value)
  return lang === 'bn' ? toBanglaDigits(plain) : plain
}

export interface QuestionTypeMeta {
  type: QuestionType
  label: string
  description: string
}

export const QUESTION_TYPES: QuestionTypeMeta[] = [
  { type: 'short_text', label: 'Short text', description: 'A single line, such as a name or an origin.' },
  { type: 'long_text', label: 'Long text', description: 'A paragraph of free text.' },
  { type: 'number', label: 'Number', description: 'Distance, cost, age, or any numeric value.' },
  { type: 'date', label: 'Date', description: 'A calendar date.' },
  { type: 'time', label: 'Time', description: 'A time of day, such as departure time.' },
  { type: 'single_choice', label: 'Single choice', description: 'Pick one option from a list of radio buttons.' },
  { type: 'multi_choice', label: 'Multiple choice', description: 'Tick every option that applies.' },
  { type: 'dropdown', label: 'Dropdown', description: 'Pick one option from a compact menu.' },
  { type: 'table', label: 'Table', description: 'A grid of rows and columns, such as a trip diary.' },
  {
    type: 'choice_experiment',
    label: 'Choice experiment',
    description: 'Scenario tables built from your design cards; each respondent gets a random draw.',
  },
]

/**
 * How many question numbers a choice block takes: one per prompt per
 * scenario, so three scenarios that each ask three questions span nine.
 */
export function blockQuestionCount(
  question: Pick<ChoiceExperimentQuestion, 'scenariosPerRespondent' | 'prompts'>,
): number {
  return question.scenariosPerRespondent * Math.max(1, question.prompts.length)
}

/**
 * Question numbers as respondents see them. A choice experiment block spans
 * one number per question asked under every scenario, so the questions after
 * it keep counting up.
 */
export function questionNumbers(questions: Question[]): number[] {
  let next = 1
  return questions.map((question) => {
    const start = next
    next += question.type === 'choice_experiment' ? blockQuestionCount(question) : 1
    return start
  })
}

export function questionTypeLabel(type: QuestionType): string {
  return QUESTION_TYPES.find((meta) => meta.type === type)?.label ?? type
}

export function createOption(en = '', bn = ''): Option {
  return { id: uid(), label: text(en, bn) }
}

export function createColumn(en = '', bn = ''): TableColumn {
  return { id: uid(), label: text(en, bn), input: 'text', options: [] }
}

export function createQuestion(type: QuestionType): Question {
  const base = { id: uid(), label: text(), help: text(), required: false }
  switch (type) {
    case 'short_text':
    case 'long_text':
      return { ...base, type, placeholder: text() }
    case 'number':
      return { ...base, type, unit: text() }
    case 'date':
    case 'time':
      return { ...base, type }
    case 'single_choice':
    case 'multi_choice':
    case 'dropdown':
      return { ...base, type, options: [createOption('Option 1'), createOption('Option 2')] }
    case 'table':
      return {
        ...base,
        type,
        rows: [createOption('Row 1'), createOption('Row 2')],
        columns: [createColumn('Column 1'), createColumn('Column 2')],
        allowAddRows: false,
      }
    case 'choice_experiment':
      return {
        ...base,
        type,
        label: text('Alternative trip characteristics', 'বিকল্প যাত্রার বৈশিষ্ট্য'),
        required: true,
        layout: 'alternatives',
        attributeHeader: text('Attributes', 'বৈশিষ্ট্যসমূহ'),
        alternatives: [],
        attributes: [],
        referenceColumns: [],
        drawMode: 'random',
        cards: [],
        levelLabels: {},
        scenariosPerRespondent: 3,
        prompts: [defaultPrompt('alternatives')],
      }
  }
}

/** Yes / No, the usual answer to "would you switch to this option?". */
export function defaultChoiceOptions(): ChoiceOption[] {
  return [
    { key: 'yes', label: text('Yes', 'হ্যাঁ') },
    { key: 'no', label: text('No', 'না') },
  ]
}

/** A question under a scenario table, answered with the table's columns unless told otherwise. */
export function createPrompt(
  answer: ChoicePromptAnswer = 'alternative',
  wording: LocalizedText = text(),
): ChoicePrompt {
  return { key: uid(), text: wording, answer, options: defaultChoiceOptions(), allowOther: false }
}

/**
 * The single prompt a new block starts with: pick a column in the
 * alternatives layout, answer Yes / No to the one card in the profile layout.
 */
export function defaultPrompt(layout: ChoiceLayout): ChoicePrompt {
  return createPrompt(
    layout === 'profile' ? 'options' : 'alternative',
    text('Which option would you choose for this trip?', 'এই যাত্রার জন্য আপনি কোন বিকল্পটি বেছে নেবেন?'),
  )
}

/** Deep copy with fresh ids so the copy can live alongside the original. */
export function duplicateQuestion(question: Question): Question {
  const copy = structuredClone(question)
  copy.id = uid()
  if ('options' in copy) {
    copy.options = copy.options.map((option) => ({ ...option, id: uid() }))
  }
  if (copy.type === 'table') {
    copy.rows = copy.rows.map((row) => ({ ...row, id: uid() }))
    copy.columns = copy.columns.map((column) => ({
      ...column,
      id: uid(),
      options: column.options.map((option) => ({ ...option, id: uid() })),
    }))
  }
  return copy
}

export function createQuestionnaire(): Questionnaire {
  const now = Date.now()
  return {
    id: uid(),
    title: text('Untitled survey'),
    institution: text(),
    description: text(),
    logo: null,
    languages: ['en'],
    defaultLanguage: 'en',
    questions: [],
    teamName: '',
    responseTarget: 0,
    surveyCodePrefix: '',
    enumerators: [],
    createdAt: now,
    updatedAt: now,
  }
}
