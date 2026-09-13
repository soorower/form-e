import { describe, expect, it } from 'vitest'
import type { SurveyResponse } from '#/lib/questionnaire/types'
import { initials, memberStats, relativeTime, startOfToday, teamStats } from './stats'

const NOW = new Date(2026, 8, 11, 15, 0, 0).getTime()
const TODAY = new Date(2026, 8, 11, 9, 0, 0).getTime()
const YESTERDAY = new Date(2026, 8, 10, 18, 0, 0).getTime()

function response(enumerator: string, submittedAt: number, serial = 1): SurveyResponse {
  return {
    id: `${enumerator}-${serial}`,
    questionnaireId: 'q',
    serial,
    surveyNumber: `X-${serial}`,
    enumerator,
    language: 'en',
    answers: {},
    submittedAt,
  }
}

describe('memberStats', () => {
  it('ranks members by total, counts today, and keeps members with no responses', () => {
    const stats = memberStats({ enumerators: ['Nawal', 'Ikra', 'Sorower'] }, [
      response('Ikra', TODAY, 1),
      response('Ikra', YESTERDAY, 2),
      response('Nawal', TODAY, 3),
      response('', YESTERDAY, 4),
    ], NOW)
    expect(stats.map((s) => [s.rank, s.name, s.total, s.today])).toEqual([
      [1, 'Ikra', 2, 1],
      [2, 'Nawal', 1, 1],
      [2, '(no name)', 1, 0],
      [4, 'Sorower', 0, 0],
    ])
    expect(stats[0].lastAt).toBe(TODAY)
    expect(stats[3].lastAt).toBeNull()
    expect(stats[0].share).toBeCloseTo(0.5)
  })

  it('breaks ties on today, then name', () => {
    const stats = memberStats({ enumerators: [] }, [
      response('B', YESTERDAY, 1),
      response('A', YESTERDAY, 2),
      response('C', TODAY, 3),
    ], NOW)
    expect(stats.map((s) => s.name)).toEqual(['C', 'A', 'B'])
    expect(stats.map((s) => s.rank)).toEqual([1, 1, 1])
  })
})

describe('teamStats', () => {
  it('reports totals and progress towards the target', () => {
    const stats = teamStats({ enumerators: ['A'], responseTarget: 4 }, [
      response('A', TODAY, 1),
      response('A', YESTERDAY, 2),
    ], NOW)
    expect(stats).toMatchObject({ total: 2, today: 1, target: 4, progress: 0.5 })
    expect(teamStats({ enumerators: [], responseTarget: 0 }, [], NOW).progress).toBeNull()
    expect(teamStats({ enumerators: [], responseTarget: 1 }, [response('A', TODAY, 1), response('A', TODAY, 2)], NOW).progress).toBe(1)
  })
})

describe('helpers', () => {
  it('formats relative times and initials', () => {
    expect(relativeTime(NOW - 20_000, NOW)).toBe('just now')
    expect(relativeTime(NOW - 5 * 60_000, NOW)).toBe('5 min ago')
    expect(relativeTime(NOW - 3 * 3_600_000, NOW)).toBe('3 h ago')
    expect(relativeTime(NOW - 2 * 86_400_000, NOW)).toBe('2 d ago')
    expect(initials('Nawal Ahmed')).toBe('NA')
    expect(initials('ikra')).toBe('I')
    expect(initials('  ')).toBe('?')
    expect(initials('(no name)')).toBe('?')
    expect(initials('(Rafi) Ahmed')).toBe('RA')
    expect(startOfToday(NOW)).toBe(new Date(2026, 8, 11).getTime())
  })
})
