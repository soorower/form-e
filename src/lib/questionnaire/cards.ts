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
 * Cell text as it is compared and stored: trimmed, runs of blanks collapsed
 * ("Every  2.0 hrs" and "Every 2.0 hrs" are one level), line breaks kept.
 */
function cleanCell(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()
}

/**
 * Parses comma- or tab-separated text (as pasted from Excel or read from a
 * CSV file) into rows of cells. Quoted cells may contain the delimiter,
 * doubled quotes, and line breaks, which is how Excel copies a cell that
 * holds several lines.
 */
export function parseDelimited(input: string): string[][] {
  const source = input.replace(/^\ufeff/, '')
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
    .map((cells) => cells.map(cleanCell))
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
  /**
   * Level wording read from a translated copy of the table pasted beside the
   * cards (the Bangla half of a bilingual sheet), when there was one. The
   * translated headings have already been written into `attributes` and
   * `alternatives`.
   */
  translation?: {
    lang: Lang
    levelLabels: Record<string, LocalizedText>
    translated: number
    matchedCards: number
  }
}

/** "Set", "Card ID", "Card No.", "Scenario", "কার্ড নং", … */
const SET_COLUMN = /^(set|card( ?(id|no\.?|number))?|card_id|choice ?set|scenario|id|কার্ড( নং)?)$/i
const isSetName = (name: string) => SET_COLUMN.test(name)

const BANGLA_SCRIPT = /[ঀ-৿]/

/** A card number as it appears in the Set column of a card row. */
const isCardNumber = (value: string) => /^[1-9]\d*$/.test(fromBanglaDigits(value))

/** Key of the single card-described alternative in the profile layout. */
export const PROFILE_ALTERNATIVE = 'A'

/** A, B, C, 1, 2, … — what design scripts put after the attribute name. */
const SHORT_TOKEN = /^([A-Za-z]|\d{1,2})$/

/** The language a heading is written in, judged by its script. */
function headingLanguage(heading: string): Lang {
  return BANGLA_SCRIPT.test(heading) ? 'bn' : 'en'
}

function labelFromHeading(heading: string): LocalizedText {
  return headingLanguage(heading) === 'bn' ? text('', heading) : text(heading)
}

/** "Travel Cost" -> "Travel_Cost": a heading in the shape of a column key. */
function slug(heading: string): string {
  return heading.replace(/\s+/g, '_')
}

/** The words of a column name, split at underscores and blanks: `Cost_A`, `Travel Cost Bus`. */
function parts(header: string): string[] {
  return header.split(/[_\s]+/).filter((part) => part !== '')
}

function trailingToken(header: string): string | null {
  const pieces = parts(header)
  return pieces.length >= 2 ? pieces[pieces.length - 1] : null
}

/**
 * Finds the alternative token in a column name, wherever it sits after the
 * first part: `Cost_B` and `Cost_B_var` both belong to alternative B, with
 * attributes `Cost` and `Cost_var`. Returns null for a plain name.
 */
function splitColumn(
  header: string,
  tokens: Set<string>,
): { attribute: string; alternative: string } | null {
  const pieces = parts(header)
  for (let i = pieces.length - 1; i >= 1; i--) {
    if (tokens.has(pieces[i])) {
      return {
        attribute: [...pieces.slice(0, i), ...pieces.slice(i + 1)].join('_'),
        alternative: pieces[i],
      }
    }
  }
  return null
}

/**
 * Which tokens name alternatives, decided from a single header row alone.
 * Single letters or digits that end a column (A, B, 1, 2) are alternatives
 * when two or more different ones occur. Failing that, longer words are
 * alternatives when every column ends in one of at least two words that
 * each recur (`Time_Bus, Cost_Bus, Time_Car, Cost_Car`). An empty set means
 * the columns are plain attribute names such as `Distance_From_Residence`.
 */
function alternativeTokens(names: string[]): Set<string> {
  const trailing = names.map(trailingToken)
  const short = new Set(
    trailing.filter((token): token is string => token !== null && SHORT_TOKEN.test(token)),
  )
  if (short.size >= 2) return short

  const counts = new Map<string, number>()
  for (const token of trailing) if (token) counts.set(token, (counts.get(token) ?? 0) + 1)
  const words = [...counts.keys()]
  if (
    trailing.every((token) => token !== null) &&
    words.length >= 2 &&
    words.every((word) => (counts.get(word) ?? 0) >= 2)
  ) {
    return new Set(words)
  }
  return new Set()
}

/**
 * The level key a column maps to: `Cost_A_var` -> `Cost_var_A` given
 * alternatives A/B, so the same column is found however the token is placed.
 * Names without a token are returned unchanged.
 */
export function canonicalColumn(name: string, alternativeKeys: string[]): string {
  const split = splitColumn(name, new Set(alternativeKeys))
  return split ? `${split.attribute}_${split.alternative}` : name
}

function defaultAttributeLabel(key: string): LocalizedText {
  return labelFromHeading(key.replace(/_/g, ' '))
}

function defaultAlternativeLabel(key: string, index: number): LocalizedText {
  return SHORT_TOKEN.test(key)
    ? text(`Option ${index + 1}`, `বিকল্প ${formatNumber(index + 1, 'bn')}`)
    : labelFromHeading(key.replace(/_/g, ' '))
}

/** One header column that carries a level. */
interface HeaderColumn {
  index: number
  /** The header cell, or `<Attribute>_<Alternative>` built from a two-row header. */
  name: string
  /** Present for a two-row header: the group heading above and the cell below. */
  heading?: { attribute: string; attributeKey: string; alternative: string }
}

interface TableShape {
  headerRows: 1 | 2
  /** Index of the Set / Card ID column, or -1 when the sheet has none. */
  setIndex: number
  columns: HeaderColumn[]
  /** Two-row header cells with nothing but a heading above a blank cell. */
  ignored: string[]
}

/**
 * Whether a row is the lower row of a two-row header: alternative names
 * (Bus, Train, Air) repeating in the same order under every attribute. A
 * card row is never taken for one: its Set cell is a number, and its levels
 * do not cycle.
 */
function isAlternativeRow(row: string[], setIndex: number): boolean {
  if (setIndex !== -1 && isCardNumber(row[setIndex] ?? '')) return false
  const values = row.filter((value, index) => index !== setIndex && value !== '')
  const distinct = [...new Set(values)]
  return (
    distinct.length >= 2 &&
    values.length % distinct.length === 0 &&
    !values.some(isCardNumber) &&
    values.every((value, i) => value === distinct[i % distinct.length])
  )
}

/**
 * Columns of a two-row header. Each run of the alternative names is one
 * attribute, named by whichever cell of the upper row sits over it: Excel
 * puts a merged heading in the first cell, a centred one in the middle.
 */
function twoRowShape(first: string[], second: string[], setIndex: number): TableShape {
  const groups: number[][] = []
  let group: number[] = []
  const seen = new Set<string>()
  second.forEach((alternative, index) => {
    if (index === setIndex || alternative === '') return
    if (seen.has(alternative)) {
      groups.push(group)
      group = []
      seen.clear()
    }
    seen.add(alternative)
    group.push(index)
  })
  if (group.length > 0) groups.push(group)

  const keys = new Set<string>()
  const columns = groups.flatMap((indices, n) => {
    const attribute =
      indices.map((i) => first[i] ?? '').find((value) => value !== '') ?? `Attribute ${n + 1}`
    let attributeKey = slug(attribute)
    for (let suffix = 2; keys.has(attributeKey); suffix++) {
      attributeKey = `${slug(attribute)}_${suffix}`
    }
    keys.add(attributeKey)
    return indices.map((index) => ({
      index,
      name: `${attributeKey}_${slug(second[index])}`,
      heading: { attribute, attributeKey, alternative: second[index] },
    }))
  })
  const ignored = first.filter(
    (value, index) => index !== setIndex && value !== '' && (second[index] ?? '') === '',
  )
  return { headerRows: 2, setIndex, columns, ignored }
}

/**
 * Reads the header of a card table. It is one row (`Set, Time_A, Cost_A, …`)
 * unless the second row repeats alternative names under attribute headings,
 * the way design sheets group `Bus | Train | Air` under "Travel Cost". The
 * Set column may be labelled on either row.
 */
function readTable(rows: string[][]): TableShape {
  const [first, second = []] = rows
  const setInFirst = first.findIndex(isSetName)
  const setInSecond = second.findIndex(isSetName)
  const candidate = setInFirst !== -1 ? setInFirst : setInSecond
  if (rows.length >= 2 && isAlternativeRow(second, candidate)) {
    return twoRowShape(first, second, candidate)
  }
  return {
    headerRows: 1,
    setIndex: setInFirst,
    columns: first
      .map((name, index) => ({ index, name }))
      .filter(({ name, index }) => index !== setInFirst && name !== ''),
    ignored: [],
  }
}

/**
 * Column ranges of a pasted sheet, cut at blank columns and at a second Set
 * column. A bilingual design sheet keeps a translated copy of the cards to
 * the right of the English ones, which comes out as a second block.
 */
function splitBlocks(rows: string[][]): string[][][] {
  const width = Math.max(...rows.map((row) => row.length))
  const blank = (column: number) => rows.every((row) => (row[column] ?? '') === '')
  const setLike = (column: number) => rows.slice(0, 2).some((row) => isSetName(row[column] ?? ''))
  const ranges: [number, number][] = []
  let start = 0
  let hasSet = false
  for (let column = 0; column < width; column++) {
    if (blank(column)) {
      if (column > start) ranges.push([start, column])
      start = column + 1
      hasSet = false
    } else if (setLike(column)) {
      if (hasSet) {
        ranges.push([start, column])
        start = column
      }
      hasSet = true
    }
  }
  if (width > start) ranges.push([start, width])
  return ranges.map(([from, to]) =>
    rows.map((row) => row.slice(from, to)).filter((row) => row.some((value) => value !== '')),
  )
}

/**
 * Separates a translated copy pasted beside the cards from the cards
 * themselves. Two blocks in different scripts are the cards and their
 * translation; anything else is read as one table.
 */
function splitTranslatedCopy(rows: string[][]): {
  primary: string[][]
  translation?: { rows: string[][]; lang: Lang }
} {
  const blocks = splitBlocks(rows)
  if (blocks.length !== 2) return { primary: rows }
  const [first, second] = blocks
  const languageOf = (block: string[][]) => headingLanguage(block.slice(0, 2).flat().join(' '))
  const lang = languageOf(second)
  if (lang === languageOf(first)) return { primary: rows }
  return { primary: first, translation: { rows: second, lang } }
}

type PreviousDesign = Pick<ChoiceExperimentQuestion, 'attributes' | 'alternatives'> &
  Partial<Pick<ChoiceExperimentQuestion, 'layout'>>

function buildDesign(rows: string[][], previous?: PreviousDesign): ParsedDesign {
  if (rows.length < 2) {
    throw new Error('Paste a header row followed by at least one card.')
  }
  const shape = readTable(rows)
  const body = rows.slice(shape.headerRows)
  if (body.length === 0) {
    throw new Error('Paste a header row followed by at least one card.')
  }
  if (shape.columns.length === 0) {
    throw new Error('No attribute columns found next to the Set column.')
  }

  const attributeKeys: string[] = []
  const alternativeKeys: string[] = []
  const attributeHeadings = new Map<string, string>()
  const alternativeHeadings = new Map<string, string>()
  // `key` is where the cell lands in card.levels: the canonical
  // `<attribute>_<alternative>` in the alternatives layout, the plain name otherwise.
  const columns: { index: number; key: string }[] = []
  const ignoredColumns: string[] = [...shape.ignored]
  let layout: ChoiceLayout

  if (shape.headerRows === 2) {
    layout = 'alternatives'
    for (const column of shape.columns) {
      const { attribute, attributeKey, alternative } = column.heading!
      const alternativeKey = slug(alternative)
      if (!attributeKeys.includes(attributeKey)) {
        attributeKeys.push(attributeKey)
        attributeHeadings.set(attributeKey, attribute)
      }
      if (!alternativeKeys.includes(alternativeKey)) {
        alternativeKeys.push(alternativeKey)
        alternativeHeadings.set(alternativeKey, alternative)
      }
      columns.push({ index: column.index, key: `${attributeKey}_${alternativeKey}` })
    }
  } else {
    // Plain attribute names contain underscores too ("Distance_From_Residence"),
    // so the alternative tokens are worked out from the whole header first.
    const names = shape.columns.map(({ name }) => name)
    const tokens = alternativeTokens(names)
    layout = tokens.size >= 2 ? 'alternatives' : 'profile'

    if (layout === 'alternatives') {
      for (const { name, index } of shape.columns) {
        const split = splitColumn(name, tokens)
        if (!split) {
          ignoredColumns.push(name)
          continue
        }
        if (!attributeKeys.includes(split.attribute)) attributeKeys.push(split.attribute)
        if (!alternativeKeys.includes(split.alternative)) alternativeKeys.push(split.alternative)
        columns.push({ index, key: `${split.attribute}_${split.alternative}` })
      }
    } else {
      const trailing = names.map(trailingToken)
      const [first] = trailing
      if (first && SHORT_TOKEN.test(first) && trailing.every((token) => token === first)) {
        throw new Error(
          `Only one alternative (_${first}) was found. Name columns Cost_A and Cost_B for two alternatives, or drop the suffix so each card describes a single option.`,
        )
      }
      for (const { name, index } of shape.columns) {
        if (attributeKeys.includes(name)) {
          throw new Error(`The column "${name}" appears twice in the header.`)
        }
        attributeKeys.push(name)
        columns.push({ index, key: name })
      }
      alternativeKeys.push(PROFILE_ALTERNATIVE)
    }
  }

  const { setIndex } = shape
  const seen = new Set<number>()
  const cards: ChoiceCard[] = body.map((cells, rowIndex) => {
    const rowNumber = rowIndex + shape.headerRows + 1
    const raw = setIndex === -1 ? '' : (cells[setIndex] ?? '')
    const set = setIndex === -1 ? rowIndex + 1 : Number(fromBanglaDigits(raw))
    if (!Number.isInteger(set)) {
      throw new Error(`Row ${rowNumber}: "${raw}" is not a whole number in the Set column.`)
    }
    if (seen.has(set)) {
      throw new Error(`Row ${rowNumber}: set ${set} appears more than once.`)
    }
    seen.add(set)
    const levels: Record<string, string> = {}
    for (const column of columns) {
      levels[column.key] = cells[column.index] ?? ''
    }
    return { set, levels }
  })

  const previousAttributes = new Map(previous?.attributes.map((a) => [a.key, a]))
  // Alternative headings only carry over within the same layout: the profile
  // layout's "Proposed option" would otherwise become column A of an A/B table.
  const sameLayout = previous?.layout === undefined || previous.layout === layout
  const previousAlternatives = new Map(
    sameLayout ? previous?.alternatives.map((a) => [a.key, a.label]) : [],
  )

  return {
    layout,
    attributes: attributeKeys.map((key) => {
      const heading = attributeHeadings.get(key)
      const earlier = previousAttributes.get(key)
      return {
        key,
        label: earlier?.label ?? (heading ? labelFromHeading(heading) : defaultAttributeLabel(key)),
        ...(earlier?.group ? { group: earlier.group } : {}),
      }
    }),
    alternatives: alternativeKeys.map((key, index) => {
      const heading = alternativeHeadings.get(key)
      return {
        key,
        label:
          previousAlternatives.get(key) ??
          (layout === 'profile'
            ? text('Proposed option', 'প্রস্তাবিত বিকল্প')
            : heading
              ? labelFromHeading(heading)
              : defaultAlternativeLabel(key, index)),
      }
    }),
    cards,
    ignoredColumns,
  }
}

/**
 * Turns a pasted card table into attributes, alternatives, and cards. A
 * `Set` / `Card ID` column numbers the cards; without one they are numbered
 * by row.
 *
 * Three headers are recognised:
 * - One row of `<Attribute>_<Alternative>` names (`Time_A, Cost_A, Time_B, …`,
 *   or `Time_Bus, Cost_Bus, Time_Car, …`): the alternatives layout, where
 *   each card holds every alternative side by side.
 * - Two rows, attribute headings over repeating alternative names
 *   (`Travel Cost` spanning `Bus | Train | Air`), as design sheets are laid
 *   out in Excel: also the alternatives layout, with the headings as labels.
 * - One row of plain names (`Distance, Location, Parking, …`): the profile
 *   layout, where each card describes one option.
 *
 * A translated copy of the table pasted beside the cards (a Bangla half to
 * the right of the English one) fills the level wording and headings for
 * that language. Labels from `previous` are kept for keys that still exist.
 */
export function parseCardTable(input: string, previous?: PreviousDesign): ParsedDesign {
  const rows = parseDelimited(input)
  if (rows.length < 2) {
    throw new Error('Paste a header row followed by at least one card.')
  }
  const { primary, translation } = splitTranslatedCopy(rows)
  const design = buildDesign(primary, previous)
  if (!translation) return design

  const result = applyTranslationRows(
    {
      layout: design.layout,
      attributes: design.attributes,
      alternatives: design.alternatives,
      cards: design.cards,
      levelLabels: {},
    },
    translation.rows,
    translation.lang,
  )
  return {
    ...design,
    attributes: result.attributes,
    alternatives: result.alternatives,
    translation: {
      lang: translation.lang,
      levelLabels: result.levelLabels,
      translated: result.translated,
      matchedCards: result.matchedCards,
    },
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
  alternatives: ChoiceAlternative[]
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
  /** Alternative column headings filled from a translated two-row header. */
  alternativeLabelsFilled: number
}

type TranslatableDesign = Pick<
  ChoiceExperimentQuestion,
  'layout' | 'attributes' | 'alternatives' | 'cards' | 'levelLabels'
>

function applyTranslationRows(
  question: TranslatableDesign,
  rows: string[][],
  lang: Lang,
): TranslationResult {
  if (rows.length < 2) {
    throw new Error('Paste a header row followed by at least one card.')
  }
  if (question.cards.length === 0) {
    throw new Error('Import the cards first, then paste their translation.')
  }

  const shape = readTable(rows)
  const body = rows.slice(shape.headerRows)
  let { setIndex } = shape
  let named = shape.columns
  if (setIndex === -1 && body.every((cells) => /^\d+$/.test(fromBanglaDigits(cells[0] ?? '')))) {
    setIndex = 0
    named = named.filter((column) => column.index !== 0)
  }

  // The imported columns in the order a pasted header would list them: every
  // alternative of one attribute in a two-row header (Bus, Train, Air under
  // "Travel cost"), otherwise every attribute of A, then of B, as `Time_A,
  // Cost_A, Time_B, Cost_B` sheets go.
  const pair = (attribute: ChoiceAttribute, alternative: ChoiceAlternative) => ({
    attribute,
    alternative,
    column: columnKey(question, attribute.key, alternative.key),
  })
  const imported =
    shape.headerRows === 2
      ? question.attributes.flatMap((attribute) =>
          question.alternatives.map((alternative) => pair(attribute, alternative)),
        )
      : question.alternatives.flatMap((alternative) =>
          question.attributes.map((attribute) => pair(attribute, alternative)),
        )
  // Header names are compared in their canonical form, so "Cost_A_var" in the
  // translated sheet still finds the imported column stored as "Cost_var_A".
  const alternativeKeys = question.alternatives.map((alternative) => alternative.key)
  const lower = (value: string) =>
    (question.layout === 'alternatives' ? canonicalColumn(value, alternativeKeys) : value).toLowerCase()
  const byName = imported.every(({ column }) =>
    named.some(({ name }) => lower(name) === lower(column)),
  )
  let mapping: (ReturnType<typeof pair> & { header: HeaderColumn })[]
  if (byName) {
    mapping = imported.map((entry) => ({
      ...entry,
      header: named.find(({ name }) => lower(name) === lower(entry.column))!,
    }))
  } else {
    if (named.length !== imported.length) {
      throw new Error(
        `The pasted table has ${named.length} attribute columns but the imported cards have ${imported.length}. Paste the same table with the same columns, translated.`,
      )
    }
    mapping = imported.map((entry, i) => ({ ...entry, header: named[i] }))
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
      const translated = cells[entry.header.index] ?? ''
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

  // A translated header (matched by position, so its names differ from the
  // imported ones) fills the row and column headings still empty in `lang`.
  let attributeLabelsFilled = 0
  const attributes = question.attributes.map((attribute) => {
    if (byName || attribute.label[lang]) return attribute
    const entry = mapping.find((candidate) => candidate.attribute.key === attribute.key)
    const heading = entry?.header.heading?.attribute ?? entry?.header.name ?? ''
    if (!heading || heading === entry?.column || slug(heading) === attribute.key) return attribute
    attributeLabelsFilled += 1
    return { ...attribute, label: { ...attribute.label, [lang]: heading } }
  })

  let alternativeLabelsFilled = 0
  const alternatives = question.alternatives.map((alternative) => {
    if (byName || shape.headerRows !== 2 || alternative.label[lang]) return alternative
    const entry = mapping.find((candidate) => candidate.alternative.key === alternative.key)
    const heading = entry?.header.heading?.alternative ?? ''
    if (!heading || slug(heading) === alternative.key) return alternative
    alternativeLabelsFilled += 1
    return { ...alternative, label: { ...alternative.label, [lang]: heading } }
  })

  return {
    levelLabels,
    attributes,
    alternatives,
    translated: seen.size,
    matchedCards,
    unmatchedSets,
    conflicts: [...conflicts],
    attributeLabelsFilled,
    alternativeLabelsFilled,
  }
}

/**
 * Fills the level wording for `lang` from a translated copy of the card
 * table, so wording that already exists in a Bangla sheet need not be typed
 * again. Rows are matched by set number; columns by name when the header
 * repeats the imported column names, otherwise by position in the imported
 * order. Every cell whose translation differs from the imported level becomes
 * that level's wording. A translated header also fills any attribute row
 * labels (and, from a two-row header, alternative headings) still empty in
 * `lang`.
 */
export function applyTranslationTable(
  question: TranslatableDesign,
  input: string,
  lang: Lang,
): TranslationResult {
  return applyTranslationRows(question, parseDelimited(input), lang)
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

export interface AttributeSection {
  /** The heading shown above the section, or undefined for rows without one. */
  group: LocalizedText | undefined
  attributes: ChoiceAttribute[]
}

/**
 * Attributes in display order, cut into sections: consecutive attributes
 * that share a `group` heading form one section shown under that heading,
 * such as "Home to Sylhet station" over access time and access cost.
 */
export function attributeSections(attributes: ChoiceAttribute[]): AttributeSection[] {
  const identity = (group: LocalizedText | undefined) =>
    group ? `${group.en.trim()} ${group.bn.trim()}`.replace(/^ $/, '') : ''
  const sections: AttributeSection[] = []
  for (const attribute of attributes) {
    const last = sections.at(-1)
    if (last && identity(last.group) === identity(attribute.group)) {
      last.attributes.push(attribute)
    } else {
      sections.push({
        group: identity(attribute.group) ? attribute.group : undefined,
        attributes: [attribute],
      })
    }
  }
  return sections
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

/**
 * A two-row header as Excel design sheets lay it out: attribute headings
 * over Bus | Train | Air, with the Card ID label on the lower row.
 */
export const EXAMPLE_TWO_ROW_CARD_TABLE = [
  '\tTravel Cost\t\t\tTravel Time\t\t\tFrequency\t\t',
  'Card ID\tBus\tTrain\tAir\tBus\tTrain\tAir\tBus\tTrain\tAir',
  '1\tSame as now\tSame as now\t10% less than now\t15% more than now\t15% less than now\t5% less than now\tEvery 45 minutes\t3 trains per day\tEvery 1.5 hours',
  '2\t10% less than now\t10% less than now\t10% more than now\tSame as now\tSame as now\t5% less than now\tEvery 1 hour\t4 trains per day\tEvery 1.5 hours',
  '3\t10% less than now\t10% more than now\t10% less than now\tSame as now\t15% less than now\t5% less than now\tEvery 30 minutes\t3 trains per day\tEvery 1.5 hours',
  '4\t10% less than now\t10% less than now\t10% less than now\t15% less than now\t15% less than now\t5% more than now\tEvery 1 hour\t5 trains per day\tEvery 2.5 hours',
].join('\n')
