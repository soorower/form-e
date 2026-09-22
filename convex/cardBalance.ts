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
