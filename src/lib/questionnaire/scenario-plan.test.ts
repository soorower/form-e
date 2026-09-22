import { describe, expect, it } from 'vitest'
import { createQuestion } from './factory'
import {
  EXAMPLE_SCENARIO_PLAN,
  checkScenarioPlan,
  followsPlan,
  leastUsedPlanRow,
  parseScenarioPlan,
  scenariosFromPlanRow,
  splitScenarioPlan,
} from './scenario-plan'
import type { ChoiceExperimentQuestion } from './types'

function block(patch: Partial<ChoiceExperimentQuestion> = {}): ChoiceExperimentQuestion {
  const question = createQuestion('choice_experiment') as ChoiceExperimentQuestion
  return {
    ...question,
    cards: [1, 2, 3, 4].map((set) => ({ set, levels: { Cost_A: `${set}00 Taka` } })),
    ...patch,
  }
}

describe('parseScenarioPlan', () => {
  it('reads a Set / Scenario1 / Scenario2 … sheet as pasted from Excel', () => {
    const plan = parseScenarioPlan(
      ['Set\tScenario1\tScenario2\tScenario3', '1\t14\t21\t25', '2\t50\t29\t30'].join('\n'),
    )
    expect(plan.rows).toEqual([
      { row: 1, sets: [14, 21, 25] },
      { row: 2, sets: [50, 29, 30] },
    ])
    expect(plan.scenariosPerRow).toBe(3)
    expect(plan.hadHeader).toBe(true)
    expect(plan.hadRowColumn).toBe(true)
  })

  it('reads the example, and a comma-separated file the same way', () => {
    const pasted = parseScenarioPlan(EXAMPLE_SCENARIO_PLAN)
    const csv = parseScenarioPlan(EXAMPLE_SCENARIO_PLAN.replace(/\t/g, ','))
    expect(csv.rows).toEqual(pasted.rows)
    expect(pasted.rows).toHaveLength(5)
  })

  it('takes as many scenario columns as the sheet has, nine included', () => {
    // The AC Bus workbook's `Scenario` sheet is 50 rows of 9. Nine columns
    // must give ONE block of nine scenarios, not three blocks of three, and
    // the column count is what `scenariosPerRespondent` becomes.
    const plan = parseScenarioPlan(EXAMPLE_SCENARIO_PLAN)
    expect(plan.scenariosPerRow).toBe(9)
    expect(plan.rows[0]).toEqual({ row: 1, sets: [14, 21, 25, 2, 7, 23, 35, 34, 9] })
    // Row 3 names card 22 twice and card 18 twice, as the real sheet does.
    expect(plan.rows[2]).toEqual({ row: 3, sets: [18, 24, 21, 22, 22, 2, 18, 25, 46] })

    // Nothing is special about nine: a twenty-column sheet reads as twenty.
    const wide = parseScenarioPlan(
      [
        ['Set', ...Array.from({ length: 20 }, (_u, i) => `Scenario${i + 1}`)].join('\t'),
        ['1', ...Array.from({ length: 20 }, (_u, i) => String(i + 1))].join('\t'),
      ].join('\n'),
    )
    expect(wide.scenariosPerRow).toBe(20)
    expect(wide.rows[0].sets).toHaveLength(20)
  })

  it('keeps the row numbers from the sheet, even when they do not start at 1', () => {
    const plan = parseScenarioPlan(['Respondent,S1,S2', '7,3,4', '8,1,2'].join('\n'))
    expect(plan.rows).toEqual([
      { row: 7, sets: [3, 4] },
      { row: 8, sets: [1, 2] },
    ])
  })

  it('numbers the rows itself when the sheet has no row column', () => {
    const plan = parseScenarioPlan(['Scenario1,Scenario2', '14,21', '50,29'].join('\n'))
    expect(plan.hadRowColumn).toBe(false)
    expect(plan.rows).toEqual([
      { row: 1, sets: [14, 21] },
      { row: 2, sets: [50, 29] },
    ])
  })

  it('treats a leading 1, 2, 3 … column as row numbers even with no header', () => {
    const plan = parseScenarioPlan(['1,14,21', '2,50,29', '3,18,24'].join('\n'))
    expect(plan.hadHeader).toBe(false)
    expect(plan.hadRowColumn).toBe(true)
    expect(plan.rows).toEqual([
      { row: 1, sets: [14, 21] },
      { row: 2, sets: [50, 29] },
      { row: 3, sets: [18, 24] },
    ])
  })

  it('still finds the row column under a heading it does not know', () => {
    // "Sl No" is not in the list of row-column names, but 1, 2, 3 … from the
    // top is: without this its row numbers were read as card numbers.
    const plan = parseScenarioPlan(['Sl No,S1,S2', '1,14,21', '2,50,29'].join('\n'))
    expect(plan.hadRowColumn).toBe(true)
    expect(plan.rows).toEqual([
      { row: 1, sets: [14, 21] },
      { row: 2, sets: [50, 29] },
    ])
  })

  it('keeps a card named twice in one row, as the sheet says', () => {
    const plan = parseScenarioPlan(['Set,S1,S2,S3', '3,22,22,2'].join('\n'))
    expect(plan.rows).toEqual([{ row: 3, sets: [22, 22, 2] }])
  })

  it('allows rows of different lengths and reports the longest', () => {
    const plan = parseScenarioPlan(['Set,S1,S2,S3', '1,4,5,6', '2,7,8'].join('\n'))
    expect(plan.scenariosPerRow).toBe(3)
    expect(plan.rows[1].sets).toEqual([7, 8])
  })

  it('reads Bangla digits', () => {
    const plan = parseScenarioPlan(['সেট,দৃশ্যপট১,দৃশ্যপট২', '১,১৪,২১'].join('\n'))
    expect(plan.rows).toEqual([{ row: 1, sets: [14, 21] }])
  })

  it('moves a repeated row number onto the next free one, so no row is unreachable', () => {
    const plan = parseScenarioPlan(['Set,S1', '1,4', '1,5', '2,6'].join('\n'))
    expect(plan.rows.map((row) => row.row)).toEqual([1, 2, 3])
  })

  it('refuses a sheet with no card numbers at all', () => {
    expect(() => parseScenarioPlan('Set,Scenario1\nfirst,second')).toThrow(/No card numbers/)
    expect(() => parseScenarioPlan('   ')).toThrow(/nothing to read/)
  })
})

describe('following a plan', () => {
  it('is only followed once a plan has been imported', () => {
    expect(followsPlan(block({ drawMode: 'plan' }))).toBe(false)
    expect(followsPlan(block({ drawMode: 'plan', scenarioPlan: [{ row: 1, sets: [1] }] }))).toBe(true)
    expect(
      followsPlan(block({ drawMode: 'balanced', scenarioPlan: [{ row: 1, sets: [1] }] })),
    ).toBe(false)
  })

  it('shows the row exactly as written: order kept, repeats kept', () => {
    const question = block({
      drawMode: 'plan',
      scenarioPlan: [{ row: 2, sets: [3, 1, 3] }],
    })
    expect(scenariosFromPlanRow(question, 2).map((scenario) => scenario.set)).toEqual([3, 1, 3])
    expect(scenariosFromPlanRow(question, 2)[0].levels).toEqual({ Cost_A: '300 Taka' })
  })

  it('leaves out a set number the block has no card for', () => {
    const question = block({ drawMode: 'plan', scenarioPlan: [{ row: 1, sets: [2, 99, 4] }] })
    expect(scenariosFromPlanRow(question, 1).map((scenario) => scenario.set)).toEqual([2, 4])
  })

  it('gives nothing for a row the plan no longer holds', () => {
    expect(scenariosFromPlanRow(block({ scenarioPlan: [] }), 1)).toEqual([])
  })

  it('takes the least-used row, the lowest-numbered of equals', () => {
    const question = block({
      drawMode: 'plan',
      scenarioPlan: [1, 2, 3].map((row) => ({ row, sets: [row] })),
    })
    expect(leastUsedPlanRow(question, { 1: 4, 2: 4, 3: 1 })).toBe(3)
    // A row never used counts as zero rather than being skipped.
    expect(leastUsedPlanRow(question, { 1: 1, 2: 1 })).toBe(3)
  })

  it('walks the rows in order, so the plan row matches the survey number', () => {
    // The whole point of the lowest-numbered tie-break: response 1 gets row 1,
    // response 2 row 2, … and after the last row it begins again at row 1.
    // Ties broken at random gave the first interview row 41.
    const question = block({
      drawMode: 'plan',
      scenarioPlan: [1, 2, 3, 4].map((row) => ({ row, sets: [row] })),
    })
    const usage: Record<number, number> = {}
    const handedOut = []
    for (let response = 1; response <= 6; response += 1) {
      const row = leastUsedPlanRow(question, usage)
      usage[row] = (usage[row] ?? 0) + 1
      handedOut.push(row)
    }
    expect(handedOut).toEqual([1, 2, 3, 4, 1, 2])
  })
})

describe('splitScenarioPlan', () => {
  const blocks = [
    { id: 'a', scenariosPerRespondent: 3 },
    { id: 'b', scenariosPerRespondent: 3 },
    { id: 'c', scenariosPerRespondent: 3 },
  ]

  it('shares one nine-column sheet over three blocks of three', () => {
    // The AC Bus layout: one row per respondent covering the whole interview.
    const { rows } = parseScenarioPlan(EXAMPLE_SCENARIO_PLAN)
    const split = splitScenarioPlan(rows, blocks)

    expect(split.spans).toEqual([
      { id: 'a', from: 1, to: 3 },
      { id: 'b', from: 4, to: 6 },
      { id: 'c', from: 7, to: 9 },
    ])
    // Sheet row 1 is 14 21 25 | 2 7 23 | 35 34 9.
    expect(split.byBlock.get('a')![0]).toEqual({ row: 1, sets: [14, 21, 25] })
    expect(split.byBlock.get('b')![0]).toEqual({ row: 1, sets: [2, 7, 23] })
    expect(split.byBlock.get('c')![0]).toEqual({ row: 1, sets: [35, 34, 9] })
    expect(split.leftover).toBe(0)
    expect(split.missing).toBe(0)
  })

  it('gives every block the same row numbers, so one interview answers one row', () => {
    const { rows } = parseScenarioPlan(EXAMPLE_SCENARIO_PLAN)
    const split = splitScenarioPlan(rows, blocks)
    const numbers = [...split.byBlock.values()].map((block) => block.map((row) => row.row))
    expect(numbers[0]).toEqual([1, 2, 3, 4, 5])
    expect(numbers[1]).toEqual(numbers[0])
    expect(numbers[2]).toEqual(numbers[0])
  })

  it('reports columns left over and columns the sheet does not have', () => {
    const rows = [{ row: 1, sets: [1, 2, 3, 4, 5, 6, 7, 8, 9] }]
    expect(splitScenarioPlan(rows, blocks.slice(0, 2)).leftover).toBe(3)
    expect(splitScenarioPlan(rows, [...blocks, { id: 'd', scenariosPerRespondent: 2 }]).missing).toBe(2)
    // Blocks beyond the sheet simply get nothing rather than breaking.
    const short = splitScenarioPlan([{ row: 1, sets: [1, 2, 3] }], blocks)
    expect(short.byBlock.get('a')![0].sets).toEqual([1, 2, 3])
    expect(short.byBlock.get('c')![0].sets).toEqual([])
  })

  it('handles blocks of different sizes, taking each in turn', () => {
    const rows = [{ row: 4, sets: [11, 12, 13, 14, 15, 16] }]
    const split = splitScenarioPlan(rows, [
      { id: 'a', scenariosPerRespondent: 2 },
      { id: 'b', scenariosPerRespondent: 4 },
    ])
    expect(split.byBlock.get('a')![0]).toEqual({ row: 4, sets: [11, 12] })
    expect(split.byBlock.get('b')![0]).toEqual({ row: 4, sets: [13, 14, 15, 16] })
  })
})

describe('checkScenarioPlan', () => {
  it('adds up what the plan hands out and points out the odd rows', () => {
    const question = block({
      drawMode: 'plan',
      scenarioPlan: [
        { row: 1, sets: [1, 2, 3] },
        { row: 2, sets: [1, 1, 9] },
        { row: 3, sets: [2] },
      ],
    })
    const check = checkScenarioPlan(question)
    expect(check.rows).toBe(3)
    expect(check.showings).toBe(7)
    expect([...check.usage]).toEqual([
      [1, 3],
      [2, 2],
      [3, 1],
    ])
    // 9 has no card; card 4 is never shown.
    expect(check.unknownSets).toEqual([9])
    expect(check.unusedSets).toEqual([4])
    expect(check.rowsWithRepeats).toEqual([2])
    expect(check.unevenRows).toEqual([3])
  })
})
