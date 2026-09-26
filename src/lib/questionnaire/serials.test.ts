import { describe, expect, it } from 'vitest'
import { pickSerial, planRowForSerial, rangeProblem, rangesOverlap } from '../../../convex/serials'
import { paperScenarios, paperSerials } from './paper'
import { planRowForSerial as clientPlanRow } from './scenario-plan'

const team = [
  { start: 1, end: 100 }, // Ikra
  { start: 101, end: 200 }, // Sorower
  { start: 201, end: 300 }, // Tourat
  { start: 301, end: 500 }, // Mahbuba
]

describe('pickSerial', () => {
  it('counts on from the highest number when nobody has a range', () => {
    expect(pickSerial(new Set(), [])).toBe(1)
    expect(pickSerial(new Set([1, 2, 3, 7]), [])).toBe(8)
  })

  it('gives a surveyor the lowest free number in their own range', () => {
    expect(pickSerial(new Set(), team, team[1])).toBe(101)
    expect(pickSerial(new Set([101, 102, 104, 1, 2]), team, team[1])).toBe(103)
  })

  it('treats numbers held by interviews going on as taken', () => {
    const taken = new Set([301, 302])
    expect(pickSerial(taken, team, team[3])).toBe(303)
  })

  it('carries on outside every range once a surveyor\'s range is full', () => {
    const full = new Set(Array.from({ length: 100 }, (_, i) => i + 1))
    expect(pickSerial(full, team, team[0])).toBe(501)
  })

  it('keeps everyone else out of the ranges', () => {
    expect(pickSerial(new Set([5, 150]), team)).toBe(501)
    expect(pickSerial(new Set([501, 502]), team)).toBe(503)
    // A gap between ranges is used before jumping past the next one.
    expect(pickSerial(new Set(), [{ start: 1, end: 10 }, { start: 20, end: 30 }])).toBe(11)
    expect(pickSerial(new Set([11, 12, 13, 14, 15, 16, 17, 18, 19]), [{ start: 1, end: 10 }, { start: 20, end: 30 }])).toBe(31)
  })
})

describe('ranges', () => {
  it('spots overlaps and bad ranges', () => {
    expect(rangesOverlap({ start: 1, end: 100 }, { start: 100, end: 200 })).toBe(true)
    expect(rangesOverlap({ start: 1, end: 100 }, { start: 101, end: 200 })).toBe(false)
    expect(rangeProblem({ start: 1, end: 100 })).toBeNull()
    expect(rangeProblem({ start: 0, end: 100 })).not.toBeNull()
    expect(rangeProblem({ start: 50, end: 10 })).not.toBeNull()
    expect(rangeProblem({ start: 1.5, end: 10 })).not.toBeNull()
  })
})

describe('planRowForSerial', () => {
  const rows = Array.from({ length: 50 }, (_, i) => i + 1)

  it('runs a 50-row plan ten times over 500 respondents', () => {
    expect(planRowForSerial(rows, 1)).toBe(1)
    expect(planRowForSerial(rows, 50)).toBe(50)
    expect(planRowForSerial(rows, 51)).toBe(1)
    expect(planRowForSerial(rows, 101)).toBe(1)
    expect(planRowForSerial(rows, 137)).toBe(37)
    expect(planRowForSerial(rows, 500)).toBe(50)
    const uses = new Map<number, number>()
    for (let serial = 1; serial <= 500; serial += 1) {
      const row = planRowForSerial(rows, serial)!
      uses.set(row, (uses.get(row) ?? 0) + 1)
    }
    expect(new Set(uses.values())).toEqual(new Set([10]))
  })

  it('gives every respondent their own row when the plan has a row for each', () => {
    const fiveHundred = Array.from({ length: 500 }, (_, i) => i + 1)
    for (const serial of [1, 101, 137, 301, 500]) {
      expect(planRowForSerial(fiveHundred, serial)).toBe(serial)
    }
  })

  it('follows the rows\' own numbers in order, however they were pasted', () => {
    expect(planRowForSerial([5, 3, 9], 1)).toBe(3)
    expect(planRowForSerial([5, 3, 9], 3)).toBe(9)
    expect(planRowForSerial([], 1)).toBeUndefined()
  })

  it('matches the client copy used for paper forms', () => {
    const scenarioPlan = [7, 2, 4].map((row) => ({ row, sets: [row] }))
    for (let serial = 1; serial <= 10; serial += 1) {
      expect(clientPlanRow({ scenarioPlan }, serial)).toBe(
        planRowForSerial(scenarioPlan.map((entry) => entry.row), serial),
      )
    }
  })
})

describe('paper forms', () => {
  const cards = Array.from({ length: 6 }, (_, i) => ({ set: i + 1, levels: { Cost_A: `${i}` } }))

  it('prints one copy per number, capped', () => {
    expect(paperSerials(101, 105)).toEqual([101, 102, 103, 104, 105])
    expect(paperSerials(1, 10_000)).toHaveLength(300)
  })

  it('shows a planned block the row for each number', () => {
    const block = {
      cards,
      drawMode: 'plan' as const,
      scenariosPerRespondent: 2,
      scenarioPlan: [
        { row: 1, sets: [1, 2] },
        { row: 2, sets: [3, 4] },
      ],
    }
    expect(paperScenarios(block, 1)).toMatchObject({ planRow: 1, scenarios: [{ set: 1 }, { set: 2 }] })
    expect(paperScenarios(block, 4)).toMatchObject({ planRow: 2, scenarios: [{ set: 3 }, { set: 4 }] })
  })

  it('hands other blocks their cards in turn round the deck', () => {
    const block = { cards, drawMode: 'balanced' as const, scenariosPerRespondent: 4, scenarioPlan: [] }
    expect(paperScenarios(block, 1).scenarios.map((s) => s.set)).toEqual([1, 2, 3, 4])
    expect(paperScenarios(block, 2).scenarios.map((s) => s.set)).toEqual([5, 6, 1, 2])
    expect(paperScenarios(block, 3).scenarios.map((s) => s.set)).toEqual([3, 4, 5, 6])
  })
})
