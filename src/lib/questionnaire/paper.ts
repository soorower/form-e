import { scenariosFromSets } from './cards'
import { followsPlan, planRowForSerial, scenariosFromPlanRow } from './scenario-plan'
import type { ChoiceExperimentQuestion, ChoiceScenarioAnswer } from './types'

// Paper copies of a survey, printed for a block of survey numbers so a
// surveyor can interview without a tablet. Each number gets the same cards
// every time it is printed, so a copy lost and printed again matches.

/** The most copies one print run makes: a few hundred pages is what a browser handles well. */
export const MAX_PAPER_COPIES = 300

export type PaperSize = 'a4' | 'legal'

/** The page margin on every side, in millimetres. */
export const PAPER_MARGIN_MM = 10

export const PAPER_SIZES: Record<
  PaperSize,
  { label: string; css: string; widthMm: number; heightMm: number }
> = {
  a4: { label: 'A4 (210 × 297 mm)', css: 'A4', widthMm: 210, heightMm: 297 },
  legal: { label: 'Legal (8.5 × 14 in)', css: 'legal', widthMm: 215.9, heightMm: 355.6 },
}

/** How many sheets one copy may take. */
export const PAGES_PER_COPY = 2

/**
 * Room lost to page breaks: a scenario or a question is never split, so the
 * first page usually ends a little short. Kept free when fitting.
 */
const BREAK_ALLOWANCE = 0.9

/**
 * How much a copy has to shrink to fit PAGES_PER_COPY pages, from its height
 * at full size and the height of one page's printable area (same units).
 * 1 when it already fits; never below `floor`, where text stops being
 * readable on paper.
 */
export function fitScale(copyHeight: number, pageHeight: number, floor = 0.55): number {
  if (!(copyHeight > 0) || !(pageHeight > 0)) return 1
  const room = pageHeight * PAGES_PER_COPY * BREAK_ALLOWANCE
  if (copyHeight <= room) return 1
  return Math.max(floor, Math.floor((room / copyHeight) * 100) / 100)
}

/** The survey numbers from `from` to `to`, both included, capped at MAX_PAPER_COPIES. */
export function paperSerials(from: number, to: number): number[] {
  const start = Math.max(1, Math.floor(from) || 1)
  const end = Math.max(start, Math.floor(to) || start)
  const count = Math.min(end - start + 1, MAX_PAPER_COPIES)
  return Array.from({ length: count }, (_unused, index) => start + index)
}

/** What one choice block shows on the copy printed for one survey number. */
export interface PaperScenarios {
  /** The scenario-plan row, for a block that follows a plan. */
  planRow?: number
  scenarios: ChoiceScenarioAnswer[]
}

/**
 * The cards a choice block shows on the copy for survey number `serial`.
 *
 * A block that follows a scenario plan shows the row for that number (the
 * rows in order, round again after the last), exactly as a tablet would for
 * the same number. Any other block takes its cards in turn: copy 1 gets
 * cards 1–3, copy 2 cards 4–6, and so on round the deck, so over a print run
 * every card is used as evenly as the numbers allow.
 */
export function paperScenarios(
  question: Pick<
    ChoiceExperimentQuestion,
    'cards' | 'scenarioPlan' | 'drawMode' | 'scenariosPerRespondent'
  >,
  serial: number,
): PaperScenarios {
  if (followsPlan(question)) {
    const planRow = planRowForSerial(question, serial)
    return { planRow, scenarios: scenariosFromPlanRow(question, planRow) }
  }
  const sets = [...new Set(question.cards.map((card) => card.set))].sort((a, b) => a - b)
  if (sets.length === 0) return { scenarios: [] }
  const perCopy = Math.min(Math.max(0, question.scenariosPerRespondent), sets.length)
  const first = ((Math.max(1, Math.floor(serial)) - 1) * perCopy) % sets.length
  const chosen = Array.from({ length: perCopy }, (_unused, index) => sets[(first + index) % sets.length])
  return { scenarios: scenariosFromSets(question, chosen) }
}
