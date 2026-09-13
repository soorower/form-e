export type Lang = 'en' | 'bn'

export type TextAlign = 'left' | 'center' | 'right' | 'justify'

/**
 * Optional formatting for a piece of survey text. Every field is optional:
 * an unset field keeps the element's own default look (a title is bold
 * unless `bold` is explicitly false, and so on).
 */
export interface TextStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  align?: TextAlign
}

export interface LocalizedText {
  en: string
  bn: string
  /** Applies to both languages. */
  style?: TextStyle
}

export type QuestionType =
  | 'short_text'
  | 'long_text'
  | 'number'
  | 'date'
  | 'time'
  | 'single_choice'
  | 'multi_choice'
  | 'dropdown'
  | 'table'
  | 'choice_experiment'

export interface Option {
  id: string
  label: LocalizedText
}

export type TableInputType = 'text' | 'number' | 'checkbox' | 'dropdown'

export interface TableColumn {
  id: string
  label: LocalizedText
  input: TableInputType
  /** Choices shown when `input` is 'dropdown'. */
  options: Option[]
}

interface QuestionBase {
  id: string
  label: LocalizedText
  help: LocalizedText
  required: boolean
}

export interface TextQuestion extends QuestionBase {
  type: 'short_text' | 'long_text'
  placeholder: LocalizedText
}

export interface NumberQuestion extends QuestionBase {
  type: 'number'
  min?: number
  max?: number
  unit: LocalizedText
}

export interface DateTimeQuestion extends QuestionBase {
  type: 'date' | 'time'
}

export interface ChoiceQuestion extends QuestionBase {
  type: 'single_choice' | 'multi_choice' | 'dropdown'
  options: Option[]
}

export interface TableQuestion extends QuestionBase {
  type: 'table'
  rows: Option[]
  columns: TableColumn[]
  /** Let respondents append their own rows, for example one per trip. */
  allowAddRows: boolean
}

/**
 * One alternative in a stated-preference experiment. `key` is the column
 * suffix in the card table (`Cost_A` -> "A"); the label is what respondents
 * see as the column heading ("Option 1" / "বিকল্প ১").
 */
export interface ChoiceAlternative {
  key: string
  label: LocalizedText
}

/**
 * One attribute row in the scenario table. `key` is the column prefix in the
 * card table (`Cost_A` -> "Cost"); the label is the row heading respondents
 * see ("Travel cost" / "ভ্রমণ ব্যয়").
 */
export interface ChoiceAttribute {
  key: string
  label: LocalizedText
}

/**
 * How the cards describe the choice.
 * - 'alternatives': each card holds several alternatives side by side
 *   (`Time_A, Cost_A, Time_B, Cost_B`); the respondent picks a column.
 * - 'profile': each card describes ONE option with plain columns
 *   (`Distance, Location, Parking…`); it is shown beside fixed comparison
 *   columns (for example "your current shopping destination") and the
 *   respondent answers the prompt with `choiceOptions`, such as Yes / No.
 */
export type ChoiceLayout = 'alternatives' | 'profile'

/** A fixed column shown beside the card in the profile layout. */
export interface ChoiceReferenceColumn {
  key: string
  /** Column heading, e.g. "Your current shopping destination". */
  label: LocalizedText
  /** Text shown once, spanning every attribute row, e.g. "As now". May be empty. */
  text: LocalizedText
}

/** An answer to the prompt in the profile layout, e.g. Yes / No. */
export interface ChoiceOption {
  key: string
  label: LocalizedText
}

/**
 * How cards are drawn for each respondent. 'balanced' prefers the cards shown
 * the fewest times so far, the way a pre-allocated frequency sheet would.
 */
export type CardDrawMode = 'random' | 'balanced'

/** One row of the experimental design: the level shown for every attribute × alternative. */
export interface ChoiceCard {
  /** The design's set number, unique within the block. Recorded with every response. */
  set: number
  /** Raw level text keyed by the card-table column name, e.g. `Cost_A` -> "1250 Taka". */
  levels: Record<string, string>
}

/**
 * A block of choice scenarios. Each respondent is shown
 * `scenariosPerRespondent` cards drawn at random from `cards`, one table per
 * card, and picks one alternative per table.
 */
export interface ChoiceExperimentQuestion extends QuestionBase {
  type: 'choice_experiment'
  layout: ChoiceLayout
  /** Heading of the first table column, e.g. "Trip attributes" / "Type of facility". */
  attributeHeader: LocalizedText
  alternatives: ChoiceAlternative[]
  attributes: ChoiceAttribute[]
  /** Profile layout only. */
  referenceColumns: ChoiceReferenceColumn[]
  /** Profile layout only; the answer buttons under each scenario. */
  choiceOptions: ChoiceOption[]
  drawMode: CardDrawMode
  cards: ChoiceCard[]
  /**
   * Display text per language for a raw level string from the cards, e.g.
   * "5 Hours" -> { en: "5 hours", bn: "৫ ঘন্টা" }. Missing entries fall back
   * to the raw text.
   */
  levelLabels: Record<string, LocalizedText>
  scenariosPerRespondent: number
  /** The question asked under every scenario table. */
  prompt: LocalizedText
}

export type Question =
  | TextQuestion
  | NumberQuestion
  | DateTimeQuestion
  | ChoiceQuestion
  | TableQuestion
  | ChoiceExperimentQuestion

export interface Questionnaire {
  id: string
  title: LocalizedText
  /** Department, university, or organisation shown under the title. */
  institution: LocalizedText
  description: LocalizedText
  /** Data URL of the uploaded logo, or null when none is set. */
  logo: string | null
  languages: Lang[]
  defaultLanguage: Lang
  questions: Question[]
  /** Name of the field team collecting this survey. One survey has one team. */
  teamName: string
  /** Number of responses the team is aiming for; 0 means no target. */
  responseTarget: number
  /** Prefix for survey numbers, e.g. "ACBUS-" gives ACBUS-001, ACBUS-002, … */
  surveyCodePrefix: string
  /**
   * Team members who collect responses. When non-empty, the enumerator must
   * pick their name before filling in a form; when empty, a free-text name
   * field is offered instead.
   */
  enumerators: string[]
  createdAt: number
  updatedAt: number
}

export type CellValue = string | boolean

export interface TableAnswerRow {
  /** A fixed row id from the question, or a generated id for rows the respondent added. */
  id: string
  cells: Record<string, CellValue>
}

export interface TableAnswer {
  rows: TableAnswerRow[]
}

export interface ChoiceScenarioAnswer {
  /** Set number of the card that was shown. */
  set: number
  /** Snapshot of the card's levels at the time it was shown. */
  levels: Record<string, string>
  /** Key of the chosen alternative, or '' while unanswered. */
  choice: string
}

export interface ChoiceExperimentAnswer {
  scenarios: ChoiceScenarioAnswer[]
}

export type AnswerValue = string | string[] | TableAnswer | ChoiceExperimentAnswer | null

export interface SurveyResponse {
  id: string
  questionnaireId: string
  /** Running number of this response on the device that collected it, from 1. */
  serial: number
  /** Human-readable survey number: prefix + zero-padded serial, e.g. ACBUS-007. */
  surveyNumber: string
  /** Name of the team member who collected the response. */
  enumerator: string
  language: Lang
  answers: Record<string, AnswerValue>
  submittedAt: number
}
