// The arithmetic behind balanced card drawing, kept free of Convex imports so
// it can be tested from src/lib/questionnaire/card-balance.test.ts.

/** How many times each card (by set number) has been used. */
export type CardCounts = Map<number, number>

/**
 * How long a card handed to an interview stays counted while no response has
 * arrived for it. A reload or a closed tab abandons the cards it was given;
 * after this they count as unused again and are the first to be handed out.
 */
export const CARD_RESERVATION_MS = 2 * 60 * 60 * 1000

function bump(into: Map<string, CardCounts>, questionId: string, set: number) {
  const counts = into.get(questionId) ?? new Map<number, number>()
  counts.set(set, (counts.get(set) ?? 0) + 1)
  into.set(questionId, counts)
}

/**
 * Adds the cards one response showed, per choice-experiment question id. When
 * `planRows` is given, the row of the creator's scenario plan the response was
 * given is tallied there, so plan rows are handed out as evenly as cards are.
 */
export function tallyAnswers(
  answers: unknown,
  into: Map<string, CardCounts>,
  planRows?: Map<string, CardCounts>,
): void {
  if (!answers || typeof answers !== 'object') return
  for (const [questionId, value] of Object.entries(answers as Record<string, unknown>)) {
    const answer = value as { scenarios?: unknown; planRow?: unknown } | null
    const scenarios = answer?.scenarios
    if (!Array.isArray(scenarios)) continue
    if (planRows && typeof answer?.planRow === 'number') {
      bump(planRows, questionId, answer.planRow)
    }
    for (const scenario of scenarios as { set?: unknown }[]) {
      if (typeof scenario?.set === 'number') bump(into, questionId, scenario.set)
    }
  }
}

/** Adds cards handed to an interview that has not been submitted yet. */
export function tallySets(questionId: string, sets: number[], into: Map<string, CardCounts>): void {
  for (const set of sets) bump(into, questionId, set)
}

/**
 * The plan row to hand out next: the least-used, and among equals the
 * lowest-numbered. The lowest-numbered tie-break is what keeps the plan in
 * step with the survey numbering — response 1 takes row 1, response 2 row 2 —
 * and once every row has gone out once it begins again at row 1. Mirrors
 * `leastUsedPlanRow` in src/lib/questionnaire/scenario-plan.ts, which the
 * tablet falls back on when it cannot reach the server.
 */
export function nextPlanRow(rows: number[], usage: CardCounts): number | undefined {
  let best: { row: number; used: number } | undefined
  for (const row of rows) {
    const used = usage.get(row) ?? 0
    if (!best || used < best.used || (used === best.used && row < best.row)) {
      best = { row, used }
    }
  }
  return best?.row
}

/** Adds one plan row held by an interview that has not been submitted yet. */
export function tallyPlanRow(
  questionId: string,
  planRow: number,
  into: Map<string, CardCounts>,
): void {
  bump(into, questionId, planRow)
}

function shuffle<T>(items: T[], random: (max: number) => number) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = random(i + 1)
    ;[items[i], items[j]] = [items[j], items[i]]
  }
}

/**
 * The `count` least-used cards, ties broken at random, returned in random
 * order. Taking the least-used first keeps the most- and least-used card
 * within one of each other: if they were before the draw, they still are
 * after it, however `count` divides into the number of cards.
 */
export function pickLeastUsed(
  sets: number[],
  count: number,
  usage: CardCounts,
  random: (max: number) => number = (max) => Math.floor(Math.random() * max),
): number[] {
  const pool = [...new Set(sets)]
  // Shuffle first so the stable sort leaves equal counts in random order.
  shuffle(pool, random)
  pool.sort((a, b) => (usage.get(a) ?? 0) - (usage.get(b) ?? 0))
  const chosen = pool.slice(0, Math.max(0, Math.min(count, pool.length)))
  shuffle(chosen, random)
  return chosen
}

/** Which cards (and plan row) one response showed in one choice block. */
export interface ShownCards {
  questionId: string
  sets: number[]
  planRow?: number
}

/**
 * The cards a response showed, block by block: all that card balancing needs
 * of it. Kept in a small summary row beside the response, so counting usage
 * over a 700-response survey reads kilobytes rather than every full answer.
 */
export function summarizeCards(answers: unknown): ShownCards[] {
  if (!answers || typeof answers !== 'object') return []
  const shown: ShownCards[] = []
  for (const [questionId, value] of Object.entries(answers as Record<string, unknown>)) {
    const answer = value as { scenarios?: unknown; planRow?: unknown } | null
    if (!Array.isArray(answer?.scenarios)) continue
    const sets = (answer.scenarios as { set?: unknown }[])
      .map((scenario) => scenario?.set)
      .filter((set): set is number => typeof set === 'number')
    shown.push({
      questionId,
      sets,
      ...(typeof answer.planRow === 'number' ? { planRow: answer.planRow } : {}),
    })
  }
  return shown
}

/** Adds one response's summarized cards to the usage tallies. */
export function tallyShown(
  cards: ShownCards[],
  into: Map<string, CardCounts>,
  planRows: Map<string, CardCounts>,
): void {
  for (const { questionId, sets, planRow } of cards) {
    for (const set of sets) bump(into, questionId, set)
    if (planRow !== undefined) bump(planRows, questionId, planRow)
  }
}
