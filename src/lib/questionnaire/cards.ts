import type {
  ChoiceAlternative,
  ChoiceAttribute,
  ChoiceCard,
  ChoiceExperimentQuestion,
  ChoiceLayout,
  ChoiceScenarioAnswer,
  Lang,
  LocalizedText,
} from './types'
import { formatNumber, text } from './factory'

/**
 * Parses comma- or tab-separated text (as pasted from Excel or read from a
 * CSV file) into rows of cells. Quoted cells may contain the delimiter,
 * doubled quotes, and line breaks, which is how Excel copies a cell that
 * holds several lines.
 */
export function parseDelimited(input: string): string[][] {
  const source = input.replace(/^﻿/, '')
  // Tab-separated when any of the first few lines holds a tab: a sheet title
  // pasted above the header has none, but the header and cards do.
  const delimiter = source.split(/\r?\n/, 5).some((line) => line.includes('\t')) ? '\t' : ','

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  const cleaned = rows
    .map((cells) => cells.map((value) => value.trim()))
    .filter((cells) => cells.some((value) => value !== ''))

  // A sheet title copied above the header ("Modified Card List") is a single
  // filled cell on its own row; the header is the first row with two or more.
  const filled = (cells: string[]) => cells.filter((value) => value !== '').length
  while (cleaned.length > 1 && filled(cleaned[0]) < 2 && filled(cleaned[1]) >= 2) {
    cleaned.shift()
  }
  return cleaned
}

export interface ParsedDesign {
  layout: ChoiceLayout
  attributes: ChoiceAttribute[]
  alternatives: ChoiceAlternative[]
  cards: ChoiceCard[]
  /** Header columns that did not follow the `Attribute_Alternative` pattern (alternatives layout only). */
  ignoredColumns: string[]
}

/** "Set", "Card ID", "Card No.", "Scenario", "কার্ড নং", … */
const SET_COLUMN = /^(set|card( ?(id|no\.?|number))?|card_id|choice ?set|scenario|id|কার্ড( নং)?)$/i

/** Key of the single card-described alternative in the profile layout. */
export const PROFILE_ALTERNATIVE = 'A'

function splitColumn(header: string): { attribute: string; alternative: string } | null {
  const index = header.lastIndexOf('_')
  if (index <= 0 || index === header.length - 1) return null
  return { attribute: header.slice(0, index), alternative: header.slice(index + 1) }
}

function defaultAttributeLabel(key: string): LocalizedText {
  return text(key.replace(/_/g, ' '))
}

function defaultAlternativeLabel(index: number): LocalizedText {
  return text(`Option ${index + 1}`, `বিকল্প ${formatNumber(index + 1, 'bn')}`)
}

/**
 * Turns a pasted card table into attributes, alternatives, and cards. The
 * first row is the header and a `Set` / `Card ID` column numbers the cards.
 *
 * Two layouts are recognised from the header alone:
 * - Columns named `<Attribute>_<Alternative>` (`Time_A, Cost_A, Time_B, …`)
 *   give the alternatives layout: each card holds every alternative.
 * - Plain columns (`Distance, Location, Parking, …`) give the profile layout:
 *   each card describes one option, held under a single alternative key.
 *
 * Labels from `previous` are kept for keys that still exist.
 */
export function parseCardTable(
  input: string,
  previous?: Pick<ChoiceExperimentQuestion, 'attributes' | 'alternatives'>,
): ParsedDesign {
  const rows = parseDelimited(input)
  if (rows.length < 2) {
    throw new Error('Paste a header row followed by at least one card.')
  }

  const [header, ...body] = rows
  const setIndex = header.findIndex((name) => SET_COLUMN.test(name))
  const named = header
    .map((name, index) => ({ name, index }))
    .filter(({ name, index }) => index !== setIndex && name !== '')
  if (named.length === 0) {
    throw new Error('No attribute columns found next to the Set column.')
  }

  // Plain attribute names often contain underscores too ("Distance_From_Residence"),
  // so a trailing token only means "alternative" when the same set of tokens
  // follows every attribute: Time_A, Cost_A, Time_B, Cost_B. Otherwise each
  // column is one attribute of a single-option card.
  const suffixesByAttribute = new Map<string, Set<string>>()
  const allSuffixes = new Set<string>()
  for (const { name } of named) {
    const split = splitColumn(name)
    if (!split) continue
    allSuffixes.add(split.alternative)
    const set = suffixesByAttribute.get(split.attribute) ?? new Set<string>()
    set.add(split.alternative)
    suffixesByAttribute.set(split.attribute, set)
  }
  const consistent =
    allSuffixes.size >= 2 &&
    [...suffixesByAttribute.values()].every((set) => set.size === allSuffixes.size)
  const layout: ChoiceLayout = consistent ? 'alternatives' : 'profile'

  const [onlySuffix] = allSuffixes
  if (!consistent && allSuffixes.size === 1 && /^([A-Za-z]|\d{1,2})$/.test(onlySuffix)) {
    throw new Error(
      `Only one alternative (_${onlySuffix}) was found. Name columns Cost_A and Cost_B for two alternatives, or drop the suffix so each card describes a single option.`,
    )
  }

  const attributeKeys: string[] = []
  const alternativeKeys: string[] = []
  const columns: { index: number; name: string }[] = []
  const ignoredColumns: string[] = []

  if (layout === 'alternatives') {
    for (const { name, index } of named) {
      const split = splitColumn(name)
      if (!split) {
        ignoredColumns.push(name)
        continue
      }
      if (!attributeKeys.includes(split.attribute)) attributeKeys.push(split.attribute)
      if (!alternativeKeys.includes(split.alternative)) alternativeKeys.push(split.alternative)
      columns.push({ index, name })
    }
  } else {
    for (const { name, index } of named) {
      if (attributeKeys.includes(name)) {
        throw new Error(`The column "${name}" appears twice in the header.`)
      }
      attributeKeys.push(name)
      columns.push({ index, name })
    }
    alternativeKeys.push(PROFILE_ALTERNATIVE)
  }

  const seen = new Set<number>()
  const cards: ChoiceCard[] = body.map((cells, rowIndex) => {
    const raw = setIndex === -1 ? '' : (cells[setIndex] ?? '')
    const set = setIndex === -1 ? rowIndex + 1 : Number(raw)
    if (!Number.isInteger(set)) {
      throw new Error(`Row ${rowIndex + 2}: "${raw}" is not a whole number in the Set column.`)
    }
    if (seen.has(set)) {
      throw new Error(`Row ${rowIndex + 2}: set ${set} appears more than once.`)
    }
    seen.add(set)
    const levels: Record<string, string> = {}
    for (const column of columns) {
      levels[column.name] = cells[column.index] ?? ''
    }
    return { set, levels }
  })

  const previousAttributes = new Map(previous?.attributes.map((a) => [a.key, a.label]))
  const previousAlternatives = new Map(previous?.alternatives.map((a) => [a.key, a.label]))

  return {
    layout,
    attributes: attributeKeys.map((key) => ({
      key,
      label: previousAttributes.get(key) ?? defaultAttributeLabel(key),
    })),
    alternatives: alternativeKeys.map((key, index) => ({
      key,
      label:
        previousAlternatives.get(key) ??
        (layout === 'profile'
          ? text('Proposed option', 'প্রস্তাবিত বিকল্প')
          : defaultAlternativeLabel(index)),
    })),
    cards,
    ignoredColumns,
  }
}

const BANGLA_DIGITS: Record<string, string> = {
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
}

/** "১২" -> "12", so a card number typed in Bangla still matches. */
export function fromBanglaDigits(value: string): string {
  return value.replace(/[০-৯]/g, (digit) => BANGLA_DIGITS[digit] ?? digit)
}

export interface TranslationResult {
  levelLabels: Record<string, LocalizedText>
  attributes: ChoiceAttribute[]
  /** Distinct levels that received wording in this run. */
  translated: number
  /** Cards in the pasted table that matched an imported card by set number. */
  matchedCards: number
  /** Set numbers in the pasted table that are not among the imported cards. */
  unmatchedSets: number[]
  /** Levels the pasted table translated two different ways; the first wording was kept. */
  conflicts: string[]
  /** Attribute row labels filled from a translated header. */
  attributeLabelsFilled: number
}

/**
 * Fills the level wording for `lang` from a translated copy of the card
 * table, so wording that already exists in a Bangla sheet need not be typed
 * again. Rows are matched by set number; columns by name when the header
 * repeats the imported column names, otherwise by position in the imported
 * order. Every cell whose translation differs from the imported level becomes
 * that level's wording. A translated header (profile layout) also fills any
 * attribute row labels still empty in `lang`.
 */
export function applyTranslationTable(
  question: ChoiceExperimentQuestion,
  input: string,
  lang: Lang,
): TranslationResult {
  const rows = parseDelimited(input)
  if (rows.length < 2) {
    throw new Error('Paste a header row followed by at least one card.')
  }
  if (question.cards.length === 0) {
    throw new Error('Import the cards first, then paste their translation.')
  }

  const [header, ...body] = rows
  let setIndex = header.findIndex((name) => SET_COLUMN.test(name))
  if (setIndex === -1 && body.every((cells) => /^\d+$/.test(fromBanglaDigits(cells[0] ?? '')))) {
    setIndex = 0
  }
  const named = header
    .map((name, index) => ({ name, index }))
    .filter(({ name, index }) => index !== setIndex && name !== '')

  // The imported columns in canonical order: every attribute of A, then of B, …
  const imported = question.alternatives.flatMap((alternative) =>
    question.attributes.map((attribute) => ({
      attribute,
      column: columnKey(question, attribute.key, alternative.key),
    })),
  )
  const lower = (value: string) => value.trim().toLowerCase()
  const byName = imported.every(({ column }) =>
    named.some(({ name }) => lower(name) === lower(column)),
  )
  let mapping: { attribute: ChoiceAttribute; column: string; index: number; header: string }[]
  if (byName) {
    mapping = imported.map((entry) => {
      const found = named.find(({ name }) => lower(name) === lower(entry.column))!
      return { ...entry, index: found.index, header: found.name }
    })
  } else {
    if (named.length !== imported.length) {
      throw new Error(
        `The pasted table has ${named.length} attribute columns but the imported cards have ${imported.length}. Paste the same table with the same columns, translated.`,
      )
    }
    mapping = imported.map((entry, i) => ({ ...entry, index: named[i].index, header: named[i].name }))
  }

  const cardsBySet = new Map(question.cards.map((card) => [card.set, card]))
  const levelLabels: Record<string, LocalizedText> = {}
  for (const [raw, label] of Object.entries(question.levelLabels)) levelLabels[raw] = { ...label }
  const seen = new Map<string, string>()
  const conflicts = new Set<string>()
  const unmatchedSets: number[] = []
  let matchedCards = 0

  body.forEach((cells, rowIndex) => {
    const set = setIndex === -1 ? rowIndex + 1 : Number(fromBanglaDigits(cells[setIndex] ?? ''))
    const card = cardsBySet.get(set)
    if (!card) {
      unmatchedSets.push(Number.isInteger(set) ? set : rowIndex + 1)
      return
    }
    matchedCards += 1
    for (const entry of mapping) {
      const raw = card.levels[entry.column] ?? ''
      const translated = cells[entry.index] ?? ''
      if (raw === '' || translated === '' || raw === translated) continue
      const earlier = seen.get(raw)
      if (earlier !== undefined) {
        if (earlier !== translated) conflicts.add(raw)
        continue
      }
      seen.set(raw, translated)
      levelLabels[raw] = { ...(levelLabels[raw] ?? text()), [lang]: translated }
    }
  })

  let attributeLabelsFilled = 0
  const attributes = question.attributes.map((attribute) => {
    if (byName || attribute.label[lang]) return attribute
    const entry = mapping.find((candidate) => candidate.attribute.key === attribute.key)
    const heading = entry?.header ?? ''
    if (!heading || heading === entry?.column || heading === attribute.key) return attribute
    attributeLabelsFilled += 1
    return { ...attribute, label: { ...attribute.label, [lang]: heading } }
  })

  return {
    levelLabels,
    attributes,
    translated: seen.size,
    matchedCards,
    unmatchedSets,
    conflicts: [...conflicts],
    attributeLabelsFilled,
  }
}

/**
 * The card-table column that holds one attribute of one alternative:
 * `Cost_B` in the alternatives layout, plain `Cost` in the profile layout,
 * where the single alternative's columns carry no suffix.
 */
export function columnKey(
  question: Pick<ChoiceExperimentQuestion, 'layout'>,
  attribute: string,
  alternative: string,
): string {
  return question.layout === 'profile' ? attribute : `${attribute}_${alternative}`
}

/** The distinct raw level strings for one attribute, in order of first appearance. */
export function attributeLevels(question: ChoiceExperimentQuestion, attributeKey: string): string[] {
  const levels: string[] = []
  for (const card of question.cards) {
    for (const alternative of question.alternatives) {
      const value = card.levels[columnKey(question, attributeKey, alternative.key)]
      if (value !== undefined && value !== '' && !levels.includes(value)) levels.push(value)
    }
  }
  return levels
}

/** Display text for a raw level in the given language, falling back to the raw text. */
export function levelLabel(
  question: Pick<ChoiceExperimentQuestion, 'levelLabels'>,
  raw: string,
  lang: Lang,
): string {
  const label = question.levelLabels[raw]
  return (label && label[lang]) || raw
}

/** Uniform random integer in [0, max). Uses the Web Crypto API when present. */
export function randomIndex(max: number): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buffer = new Uint32Array(1)
    crypto.getRandomValues(buffer)
    return buffer[0] % max
  }
  return Math.floor(Math.random() * max)
}

/** How many times each card (by set number) has already been shown. */
export type CardExposure = Record<number, number>

/** In-place Fisher–Yates shuffle of the first `count` positions. */
function shuffleFront<T>(pool: T[], count: number, random: (max: number) => number) {
  for (let i = 0; i < count; i++) {
    const j = i + random(pool.length - i)
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
}

/**
 * Draws `scenariosPerRespondent` distinct cards and returns them as
 * unanswered scenarios, in random order. Draws every card when there are
 * fewer cards than requested.
 *
 * 'random' draws uniformly. 'balanced' takes the cards shown the fewest times
 * so far (ties broken at random), so exposure evens out across respondents
 * the way a pre-allocated frequency sheet does; without exposure counts it
 * falls back to a uniform draw.
 */
export function drawScenarios(
  question: Pick<ChoiceExperimentQuestion, 'cards' | 'scenariosPerRespondent'> &
    Partial<Pick<ChoiceExperimentQuestion, 'drawMode'>>,
  random: (max: number) => number = randomIndex,
  exposure?: CardExposure,
): ChoiceScenarioAnswer[] {
  const pool = [...question.cards]
  const count = Math.min(Math.max(0, question.scenariosPerRespondent), pool.length)

  if (question.drawMode === 'balanced' && exposure && pool.length > 0) {
    // Shuffle first so equal exposure counts are ordered at random, then a
    // stable sort brings the least-shown cards to the front.
    shuffleFront(pool, pool.length, random)
    pool.sort((a, b) => (exposure[a.set] ?? 0) - (exposure[b.set] ?? 0))
    const chosen = pool.slice(0, count)
    shuffleFront(chosen, chosen.length, random)
    return chosen.map((card) => ({ set: card.set, levels: { ...card.levels }, choice: '' }))
  }

  shuffleFront(pool, count, random)
  return pool.slice(0, count).map((card) => ({
    set: card.set,
    levels: { ...card.levels },
    choice: '',
  }))
}

/** A short card table in the accepted format, used as an in-app example. */
export const EXAMPLE_CARD_TABLE = [
  'Set\tTime_A\tCost_A\tReliability_A\tTime_B\tCost_B\tReliability_B',
  '1\t5 Hours\t1800 Taka\t4.75 Hours - 5.50 Hours\t7 Hours\t1250 Taka\t6.75 Hours - 7.50 Hours',
  '2\t9 Hours\t1600 Taka\t8.75 Hours - 9.50 Hours\t9 Hours\t1450 Taka\t8 Hours - 11 Hours',
  '3\t5 Hours\t2000 Taka\t4.50 Hours - 6.00 Hours\t7 Hours\t2000 Taka\t6.75 Hours - 7.50 Hours',
  '4\t5 Hours\t1800 Taka\t4 Hours - 7 Hours\t9 Hours\t1800 Taka\t8.75 Hours - 9.50 Hours',
  '5\t9 Hours\t1600 Taka\t8.75 Hours - 9.50 Hours\t7 Hours\t1250 Taka\t6.5 Hours - 8.00 Hours',
].join('\n')

/** A profile-layout example: each card is one proposed shopping mall. */
export const EXAMPLE_PROFILE_CARD_TABLE = [
  'Card ID\tDistance_From_Residence\tShopping_mall_Type\tParking_facility\tShop_Closing_Time',
  '1\t5 to 8 km\tMega mall\tPaid (50 to 100 tk)\t11 pm',
  '2\t< 2 km\tSupershop mall\tFree\t9 pm',
  '3\t2 to 5 km\tMall with groceries\tNo parking\t10 pm',
  '4\t> 8 km\tMega mall\tFree\t8 pm',
].join('\n')
