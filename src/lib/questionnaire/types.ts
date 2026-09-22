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
  /**
   * Optional section heading shown on its own row above this attribute.
   * Consecutive attributes with the same heading share one row, so "Home to
   * Sylhet station" can sit above access time and access cost, and "Sylhet
   * station to Dhaka station" above the in-vehicle rows. Rows are shown in
   * the order of `attributes`, which the editor can rearrange.
   */
  group?: LocalizedText
}

/**
 * How the cards describe the choice.
 * - 'alternatives': each card holds several alternatives side by side
 *   (`Time_A, Cost_A, Time_B, Cost_B`); the respondent picks a column.
 * - 'profile': each card describes ONE option with plain columns
 *   (`Distance, Location, Parking…`); it is shown beside fixed comparison
 *   columns (for example "your current shopping destination") and the
 *   respondent answers each prompt with its options, such as Yes / No.
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

/** One answer button under a scenario, e.g. Yes / No or a mode of transport. */
export interface ChoiceOption {
  key: string
  label: LocalizedText
}

/**
 * How a question under a scenario is answered: 'alternative' offers the
 * table's columns (Bus / Train / Air) and records the column key;
 * 'options' offers the prompt's own list and records the option key.
 */
export type ChoicePromptAnswer = 'alternative' | 'options'

/**
 * One question asked under every scenario table. A block may ask several:
 * the same mode choice under three departure-time conditions, or the main
 * mode followed by the access and egress modes. The profile layout, whose
 * table has a single card column, always answers with `options`.
 */
export interface ChoicePrompt {
  key: string
  text: LocalizedText
  answer: ChoicePromptAnswer
  /** Used when `answer` is 'options'. */
  options: ChoiceOption[]
  /** Adds an "Other" answer with a free-text field. */
  allowOther: boolean
}

/**
 * How cards are drawn for each respondent.
 * - 'balanced' hands every interview the cards used least so far (the server
 *   counts across all tablets, see `responses.drawCards`), so over the
 *   survey's `responseTarget` every card is shown equally often, give or take
 *   one.
 * - 'plan' follows `scenarioPlan`: the creator's own allocation sheet decides
 *   which cards go together, and the server hands out the plan's least-used
 *   row. Nothing is drawn.
 */
export type CardDrawMode = 'random' | 'balanced' | 'plan'

/**
 * One row of the creator's scenario plan: the cards shown to a respondent
 * assigned this row, in order. `row` is the number in the sheet's first
 * column (the "Set" of a `Set | Scenario1 | Scenario2 | …` sheet) and is
 * recorded with the response, so an interview can be traced back to the
 * planned combination. A card may appear twice in one row if the sheet says so.
 */
export interface ScenarioPlanRow {
  row: number
  sets: number[]
}

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
 * card, and answers every prompt under each table.
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
  drawMode: CardDrawMode
  cards: ChoiceCard[]
  /**
   * The creator's own card allocation, used when `drawMode` is 'plan': one
   * row per respondent group, each naming the cards that respondent sees.
   * Imported from a sheet laid out `Set | Scenario1 | Scenario2 | …`. Empty
   * on blocks that let the app draw.
   */
  scenarioPlan: ScenarioPlanRow[]
  /**
   * Display text per language for a raw level string from the cards, e.g.
   * "5 Hours" -> { en: "5 hours", bn: "৫ ঘন্টা" }. Missing entries fall back
   * to the raw text.
   */
  levelLabels: Record<string, LocalizedText>
  scenariosPerRespondent: number
  /**
   * The questions asked under every scenario table, in order. Each takes one
   * question number per scenario. A single 'alternative' prompt in the
   * alternatives layout is answered inside the table; anything else is
   * answered below it.
   */
  prompts: ChoicePrompt[]
}

export type Question =
  | TextQuestion
  | NumberQuestion
  | DateTimeQuestion
  | ChoiceQuestion
  | TableQuestion
  | ChoiceExperimentQuestion

/**
 * A contact detail that may be collected once per respondent, before the
 * questions. All four are optional for the creator to switch on; none is
 * collected unless they do.
 */
export type RespondentFieldKey = 'name' | 'email' | 'phone' | 'address'

/** One respondent detail the survey collects, and whether it must be filled in. */
export interface RespondentInfoField {
  key: RespondentFieldKey
  required: boolean
}

/**
 * The respondent's own details, asked once at the top of the form rather than
 * as ordinary questions, so they stay out of the question numbering and land
 * in their own export columns. An empty `fields` list (the default) collects
 * nothing and shows nothing.
 */
export interface RespondentInfo {
  fields: RespondentInfoField[]
  /** Wording shown under the heading, e.g. why the details are asked. */
  note: LocalizedText
}

/** What a respondent typed into the detail fields, by field key. */
export type RespondentDetails = Partial<Record<RespondentFieldKey, string>>

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
  /**
   * Which of the respondent's own details (name, email, phone, address) the
   * form asks for. Absent on surveys saved before this existed; the codec
   * fills in an empty list, which asks for nothing.
   */
  respondent: RespondentInfo
  /** The user who created the survey (a Convex users id), set by the server. */
  ownerId?: string
  /**
   * The group whose members may also edit this survey and see its responses.
   * Set by the server when the survey is created and changed by the admin;
   * absent on surveys saved before groups existed, which only the owner and
   * admins can see.
   */
  groupId?: string
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
  /**
   * Answer to the block's first prompt (an alternative or option key), or ''
   * while unanswered. Responses recorded before blocks could ask several
   * questions have only this field, so it is kept in step with `choices`.
   */
  choice: string
  /** Answer to every prompt, by prompt key. Absent on older responses. */
  choices?: Record<string, string>
  /** Free text typed for an "Other" answer, by prompt key. */
  other?: Record<string, string>
}

export interface ChoiceExperimentAnswer {
  scenarios: ChoiceScenarioAnswer[]
  /**
   * The row of the block's `scenarioPlan` these scenarios came from, when the
   * block follows a plan. Absent on drawn blocks and on responses recorded
   * before plans existed.
   */
  planRow?: number
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
  /** Set by the server when a signed-in account submitted: their users id and surveyor code. */
  surveyorId?: string
  surveyorCode?: string
  language: Lang
  /**
   * The respondent's own details, for the fields the survey asks for. Absent
   * when the survey asks for none.
   */
  respondent?: RespondentDetails
  answers: Record<string, AnswerValue>
  submittedAt: number
}

/** What the team sees of a response: who collected it and when, never the answers. */
export interface ResponseProgress {
  id: string
  questionnaireId: string
  serial: number
  enumerator: string
  surveyorCode: string | null
  submittedAt: number
}
