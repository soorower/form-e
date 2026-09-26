// Survey-number arithmetic, kept free of Convex imports so it can be tested
// from src/lib/questionnaire/serials.test.ts.

/**
 * A block of survey numbers the admin gave one surveyor, both ends included:
 * Ikra 1–100, Sorower 101–200, … Their interviews take the lowest free number
 * inside it, so each person's paper and tablet forms line up with the numbers
 * printed for them.
 */
export interface SerialRange {
  start: number
  end: number
}

/** Survey numbers are whole and start at 1; a range may span at most this many. */
export const MAX_RANGE_SIZE = 100_000

export function inRange(serial: number, range: SerialRange): boolean {
  return serial >= range.start && serial <= range.end
}

export function rangesOverlap(a: SerialRange, b: SerialRange): boolean {
  return a.start <= b.end && b.start <= a.end
}

/** Why a range cannot be used, or null when it is fine. */
export function rangeProblem(range: SerialRange): string | null {
  if (!Number.isInteger(range.start) || !Number.isInteger(range.end)) {
    return 'Survey numbers are whole numbers.'
  }
  if (range.start < 1) return 'Survey numbers start at 1.'
  if (range.end < range.start) return 'The last number must not be below the first.'
  if (range.end - range.start + 1 > MAX_RANGE_SIZE) {
    return `A range may hold at most ${MAX_RANGE_SIZE.toLocaleString('en')} numbers.`
  }
  return null
}

/**
 * The survey number the next interview gets.
 *
 * - `taken`: numbers already recorded, or held by interviews going on now.
 * - `own`: the caller's range, if the admin gave them one. They get its lowest
 *   free number; once it is full they carry on outside every range rather
 *   than be refused, so no interview is ever lost to numbering.
 * - `ranges`: every range on the survey. Everyone else counts on from the
 *   highest number outside them, skipping any range in the way, so nobody
 *   takes a number printed on someone else's paper forms. With no ranges this
 *   is simply "one more than the highest", as it always was.
 */
export function pickSerial(taken: Set<number>, ranges: SerialRange[], own?: SerialRange): number {
  if (own) {
    for (let serial = own.start; serial <= own.end; serial += 1) {
      if (!taken.has(serial)) return serial
    }
  }
  let highest = 0
  for (const serial of taken) {
    if (serial > highest && !ranges.some((range) => inRange(serial, range))) highest = serial
  }
  let serial = highest + 1
  for (;;) {
    const blocking = ranges.find((range) => inRange(serial, range))
    if (blocking) serial = blocking.end + 1
    else if (taken.has(serial)) serial += 1
    else return serial
  }
}

/**
 * The row of a scenario plan that goes with a survey number: the rows in
 * order, round again after the last. A 50-row plan run to 500 respondents is
 * the plan ten times over — number 1 and 51 and 101 all take row 1 — so a
 * surveyor handed 101–200 starts on row 1 too, and the printed paper form for
 * any number shows the same cards the tablet would. Mirrors
 * `planRowForSerial` in src/lib/questionnaire/scenario-plan.ts.
 */
export function planRowForSerial(rows: number[], serial: number): number | undefined {
  const ordered = [...new Set(rows)].sort((a, b) => a - b)
  if (ordered.length === 0) return undefined
  const index = (((Math.max(1, Math.floor(serial)) - 1) % ordered.length) + ordered.length) % ordered.length
  return ordered[index]
}
