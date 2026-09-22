import { fromBanglaDigits, parseDelimited, randomIndex, type CardExposure } from './cards'
import type { ChoiceCard, ChoiceExperimentQuestion, ChoiceScenarioAnswer, ScenarioPlanRow } from './types'

/**
 * The scenario plan: the creator's own allocation of design cards to
 * respondents, pasted from the sheet they already build in Excel or R. Rather
 * than the app drawing cards, row 3 of the plan says "show cards 18, 24, 21,
 * …" and a respondent assigned row 3 sees exactly those, in that order.
 *
 * The sheet is laid out the way `Scenario` sheets are:
 *
 *     Set   Scenario1  Scenario2  Scenario3
 *     1     14         21         25
 *     2     50         29         30
 *
 * The first column numbers the rows; the rest name card set numbers. A row
 * may name the same card twice, and rows need not all be the same length.
 */

/** "Set", "Respondent", "Row", "No.", "Serial", "উত্তরদাতা", … — the row-number column. */
const ROW_COLUMN =
  /^(set|sets|row|rows|respondent|respondents|serial|sl\.?|no\.?|number|id|group|block|version|কার্ড|সেট|নং)$/i

/** A positive whole number, in Western or Bangla digits. */
const isCount = (value: string) => /^[1-9]\d*$/.test(fromBanglaDigits(value))

const toCount = (value: string) => Number(fromBanglaDigits(value))

export interface ParsedScenarioPlan {
  rows: ScenarioPlanRow[]
  /** How many cards the longest row names; what `scenariosPerRespondent` becomes. */
  scenariosPerRow: number
  /** True when the sheet's first row was a header rather than a plan row. */
  hadHeader: boolean
  /** True when the first column numbered the rows rather than naming a card. */
  hadRowColumn: boolean
  /** Sheet rows that held no card numbers at all, by their position in the paste. */
  skippedRows: number[]
}

/**
 * Reads a pasted or uploaded scenario sheet. Throws when nothing in it looks
 * like a plan, so the editor can say so instead of storing an empty plan.
 *
 * A header row is recognised by holding no card numbers (`Scenario1` is not a
 * number). The first column numbers the rows when its heading says so, or,
 * with no header, when its values run 1, 2, 3, … from the top; otherwise
 * every column is a card and the rows are numbered in the order pasted.
 */
export function parseScenarioPlan(input: string): ParsedScenarioPlan {
  const table = parseDelimited(input)
  if (table.length === 0) throw new Error('There is nothing to read. Paste the scenario sheet first.')

  const hadHeader = !table[0].some(isCount)
  const body = hadHeader ? table.slice(1) : table
  if (body.length === 0) {
    throw new Error('The sheet has a header but no rows of card numbers under it.')
  }

  // A first column that counts 1, 2, 3, … from the top numbers the rows: a
  // randomised design's first card column is never that sequence. It is the
  // only signal without a header, and it also catches a heading this does not
  // know ("Sl No", "Respondent ID"), whose row numbers would otherwise be
  // read as card numbers.
  const firstCells = body.map((cells) => cells[0] ?? '')
  const numbersRows = firstCells.every(
    (value, index) => isCount(value) && toCount(value) === index + 1,
  )
  const hadRowColumn = (hadHeader && ROW_COLUMN.test(table[0][0] ?? '')) || numbersRows

  const rows: ScenarioPlanRow[] = []
  const skippedRows: number[] = []
  body.forEach((cells, index) => {
    const label = hadRowColumn ? (cells[0] ?? '') : ''
    const sets = (hadRowColumn ? cells.slice(1) : cells).filter(isCount).map(toCount)
    if (sets.length === 0) {
      skippedRows.push(index + (hadHeader ? 2 : 1))
      return
    }
    rows.push({ row: isCount(label) ? toCount(label) : rows.length + 1, sets })
  })

  if (rows.length === 0) {
    throw new Error(
      'No card numbers were found. Each row should hold the card set numbers shown to one respondent, for example "1, 14, 21, 25".',
    )
  }

  // Two sheet rows numbered the same would make one unreachable, so later
  // duplicates are renumbered onto the first free number.
  const used = new Set<number>()
  for (const row of rows) {
    while (used.has(row.row)) row.row += 1
    used.add(row.row)
  }

  return {
    rows,
    scenariosPerRow: Math.max(...rows.map((row) => row.sets.length)),
    hadHeader,
    hadRowColumn,
    skippedRows,
  }
}

/** The plan rows of a block, empty unless it follows a plan. */
export function planRows(
  question: Pick<ChoiceExperimentQuestion, 'scenarioPlan'>,
): ScenarioPlanRow[] {
  return question.scenarioPlan ?? []
}

/** True when this block takes its cards from the creator's plan. */
export function followsPlan(
  question: Pick<ChoiceExperimentQuestion, 'drawMode' | 'scenarioPlan'>,
): boolean {
  return question.drawMode === 'plan' && planRows(question).length > 0
}

/** The plan row with this number, or undefined when the plan no longer has it. */
export function findPlanRow(
  question: Pick<ChoiceExperimentQuestion, 'scenarioPlan'>,
  row: number,
): ScenarioPlanRow | undefined {
  return planRows(question).find((candidate) => candidate.row === row)
}

/**
 * The scenarios of one plan row: its cards in the order the plan names them,
 * repeats included. Set numbers the block no longer has a card for are left
 * out, the same way `scenariosFromSets` does.
 */
export function scenariosFromPlanRow(
  question: Pick<ChoiceExperimentQuestion, 'cards' | 'scenarioPlan'>,
  row: number,
): ChoiceScenarioAnswer[] {
  const planRow = findPlanRow(question, row)
  if (!planRow) return []
  const bySet = new Map<number, ChoiceCard>(question.cards.map((card) => [card.set, card]))
  return planRow.sets.flatMap((set) => {
    const card = bySet.get(set)
    return card ? [{ set: card.set, levels: { ...card.levels }, choice: '' }] : []
  })
}

/**
 * The plan row to hand out next, judged from how often each row has been used
 * so far: the least-used one, ties broken at random. The server decides this
 * for every interview (`responses.drawCards`, which also counts rows held by
 * interviews going on right now); this is what the tablet falls back on when
 * the server cannot be reached, so an interview is never stuck. 0 when the
 * block has no plan.
 */
export function leastUsedPlanRow(
  question: Pick<ChoiceExperimentQuestion, 'scenarioPlan'>,
  usage?: CardExposure,
  random: (max: number) => number = randomIndex,
): number {
  const rows = planRows(question).map((row) => row.row)
  if (rows.length === 0) return 0
  // Pick at random among the joint least-used rows.
  let best = Infinity
  let candidates: number[] = []
  for (const row of rows) {
    const used = usage?.[row] ?? 0
    if (used < best) {
      best = used
      candidates = [row]
    } else if (used === best) {
      candidates.push(row)
    }
  }
  return candidates[random(candidates.length)]
}

export interface PlanCheck {
  rows: number
  /** Card showings the plan hands out in all: every row's cards added up. */
  showings: number
  /** How often each card appears across the whole plan, by set number. */
  usage: Map<number, number>
  /** Set numbers the plan names for which the block holds no card. */
  unknownSets: number[]
  /** Cards the block holds that the plan never shows. */
  unusedSets: number[]
  /** Rows that name a card more than once. */
  rowsWithRepeats: number[]
  /** Rows whose card count differs from the longest row's. */
  unevenRows: number[]
}

/**
 * What a plan adds up to, for the editor to show against the cards: how often
 * each card comes up, which set numbers it names that do not exist, and which
 * cards it never shows. A plan is the creator's own allocation, so none of
 * these is an error — they are simply reported.
 */
export function checkScenarioPlan(
  question: Pick<ChoiceExperimentQuestion, 'cards' | 'scenarioPlan'>,
): PlanCheck {
  const rows = planRows(question)
  const known = new Set(question.cards.map((card) => card.set))
  const usage = new Map<number, number>()
  const unknown = new Set<number>()
  const rowsWithRepeats: number[] = []
  let showings = 0

  for (const row of rows) {
    const seen = new Set<number>()
    let repeated = false
    for (const set of row.sets) {
      showings += 1
      if (seen.has(set)) repeated = true
      seen.add(set)
      if (known.has(set)) usage.set(set, (usage.get(set) ?? 0) + 1)
      else unknown.add(set)
    }
    if (repeated) rowsWithRepeats.push(row.row)
  }

  const longest = rows.length > 0 ? Math.max(...rows.map((row) => row.sets.length)) : 0
  return {
    rows: rows.length,
    showings,
    usage,
    unknownSets: [...unknown].sort((a, b) => a - b),
    unusedSets: question.cards.map((card) => card.set).filter((set) => !usage.has(set)),
    rowsWithRepeats,
    unevenRows: rows.filter((row) => row.sets.length !== longest).map((row) => row.row),
  }
}

/** A short scenario plan in the accepted format, used as an in-app example. */
export const EXAMPLE_SCENARIO_PLAN = [
  'Set\tScenario1\tScenario2\tScenario3',
  '1\t14\t21\t25',
  '2\t50\t29\t30',
  '3\t18\t24\t21',
  '4\t43\t47\t15',
  '5\t50\t44\t24',
].join('\n')
