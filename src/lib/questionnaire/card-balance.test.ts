import { describe, expect, it } from 'vitest'
import {
  pickLeastUsed,
  tallyAnswers,
  tallyPlanRow,
  tallySets,
  type CardCounts,
} from '../../../convex/cardBalance'
import { cardPlan, scenariosFromSets } from './cards'

const sets = (n: number) => Array.from({ length: n }, (_, i) => i + 1)
const spread = (usage: CardCounts, all: number[]) => {
  const counts = all.map((set) => usage.get(set) ?? 0)
  return Math.max(...counts) - Math.min(...counts)
}

describe('pickLeastUsed', () => {
  it('takes the least-used cards, never the same one twice', () => {
    const usage: CardCounts = new Map([
      [1, 5],
      [2, 1],
      [3, 4],
      [4, 0],
      [5, 5],
    ])
    expect(pickLeastUsed(sets(5), 2, usage).sort()).toEqual([2, 4])
    expect(pickLeastUsed([1, 1, 2, 2], 5, new Map()).sort()).toEqual([1, 2])
  })

  it('keeps every card within one showing of the others over a whole survey', () => {
    // 500 responses x 3 cards over 62 cards, as in the Sylhet-Dhaka design.
    const all = sets(62)
    const usage: CardCounts = new Map()
    for (let respondent = 0; respondent < 500; respondent++) {
      for (const set of pickLeastUsed(all, 3, usage)) usage.set(set, (usage.get(set) ?? 0) + 1)
      expect(spread(usage, all)).toBeLessThanOrEqual(1)
    }
    const plan = cardPlan(500, { cards: all.map((set) => ({ set, levels: {} })), scenariosPerRespondent: 3 })
    expect(plan).toEqual({ showings: 1500, perCard: 24, extraCards: 12 })
    const counts = all.map((set) => usage.get(set) ?? 0)
    expect(counts.filter((n) => n === 24)).toHaveLength(50)
    expect(counts.filter((n) => n === 25)).toHaveLength(12)
  })

  it('stays level when several tablets hold cards at once, and closes a gap left by earlier random draws', () => {
    const all = sets(10)
    const shown: CardCounts = new Map([[1, 6], [2, 6], [3, 2]])
    const tablets: number[][] = []
    for (let round = 0; round < 40; round++) {
      // Cards in the hands of other tablets count as used for the next draw.
      const usage: CardCounts = new Map(shown)
      for (const held of tablets) for (const set of held) usage.set(set, (usage.get(set) ?? 0) + 1)
      tablets.push(pickLeastUsed(all, 3, usage))
      // The oldest of four interviews going on is submitted.
      if (tablets.length === 4) {
        for (const set of tablets.shift()!) shown.set(set, (shown.get(set) ?? 0) + 1)
      }
    }
    for (const held of tablets) for (const set of held) shown.set(set, (shown.get(set) ?? 0) + 1)
    expect(spread(shown, all)).toBeLessThanOrEqual(1)
  })
})

describe('tallying', () => {
  it('counts the cards a response showed, and ignores other answers', () => {
    const counts = new Map<string, CardCounts>()
    tallyAnswers(
      { q1: 'Teacher', block: { scenarios: [{ set: 34 }, { set: 5 }, { set: 'x' }] }, t: { rows: [] } },
      counts,
    )
    tallyAnswers({ block: { scenarios: [{ set: 34 }] } }, counts)
    tallyAnswers(null, counts)
    tallySets('block', [18, 5], counts)
    expect([...counts.keys()]).toEqual(['block'])
    expect(Object.fromEntries(counts.get('block')!)).toEqual({ 34: 2, 5: 2, 18: 1 })
  })
})

describe('cardPlan', () => {
  const block = (cards: number, scenariosPerRespondent: number) => ({
    cards: sets(cards).map((set) => ({ set, levels: {} })),
    scenariosPerRespondent,
  })

  it('shares the showings out evenly, with the remainder on some cards', () => {
    expect(cardPlan(500, block(50, 3))).toEqual({ showings: 1500, perCard: 30, extraCards: 0 })
    expect(cardPlan(10, block(4, 3))).toEqual({ showings: 30, perCard: 7, extraCards: 2 })
  })

  it('needs a target and cards', () => {
    expect(cardPlan(0, block(4, 3))).toBeNull()
    expect(cardPlan(100, block(0, 3))).toBeNull()
  })
})

describe('scenariosFromSets', () => {
  it('builds unanswered scenarios in the order given, skipping cards that are gone', () => {
    const cards = [
      { set: 1, levels: { Time_A: '5 Hours' } },
      { set: 2, levels: { Time_A: '9 Hours' } },
    ]
    expect(scenariosFromSets({ cards }, [2, 7, 1])).toEqual([
      { set: 2, levels: { Time_A: '9 Hours' }, choice: '' },
      { set: 1, levels: { Time_A: '5 Hours' }, choice: '' },
    ])
  })
})

describe('scenario plan rows on the server', () => {
  it('counts the plan row a response was given, separately from its cards', () => {
    const cards = new Map<string, CardCounts>()
    const rows = new Map<string, CardCounts>()
    tallyAnswers(
      {
        block: { planRow: 2, scenarios: [{ set: 3 }, { set: 1 }, { set: 3 }] },
        // A block that drew its own cards has no plan row to count.
        other: { scenarios: [{ set: 7 }] },
      },
      cards,
      rows,
    )
    tallyAnswers({ block: { planRow: 2, scenarios: [{ set: 3 }] } }, cards, rows)

    expect(rows.get('block')).toEqual(new Map([[2, 2]]))
    expect(rows.has('other')).toBe(false)
    expect(cards.get('block')).toEqual(
      new Map([
        [3, 3],
        [1, 1],
      ]),
    )
  })

  it('hands out the row least used, counting interviews going on right now', () => {
    const held = new Map<string, CardCounts>()
    // Rows 1 and 2 are recorded once each; row 3 is on another tablet now.
    const usage: CardCounts = new Map([
      [1, 1],
      [2, 1],
    ])
    tallyPlanRow('block', 3, held)
    for (const [row, count] of held.get('block') ?? []) {
      usage.set(row, (usage.get(row) ?? 0) + count)
    }
    // Row 4 has never gone out, so it is next — not row 3, which is reserved.
    expect(pickLeastUsed([1, 2, 3, 4], 1, usage)).toEqual([4])
  })
})
