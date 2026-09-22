import { convexToJson, type Value } from 'convex/values'
import { describe, expect, it } from 'vitest'
import type { AnswerValue, SurveyResponse } from '#/lib/questionnaire/types'
import { decodeResponse, encodeAnswers, isSafeFieldName } from './response-codec'

const plainScenario = {
  set: 7,
  levels: { Time_A: '5 Hours', Cost_A: '1450 Tk' },
  choice: 'A',
  choices: { 'prompt-1': 'A' },
}

// Cards pasted with Bangla column headings: the questionnaire saves (its
// codec sends card levels as pairs) and the same keys land in every answer.
const banglaScenario = {
  set: 3,
  levels: { 'ভ্রমণ_ব্যয়_বাস': '২০০০ টাকা', 'ভ্রমণের_সময়_বাস': '৯ ঘন্টা' },
  choice: 'বাস',
  choices: { 'prompt-1': 'বাস' },
  other: { 'prompt-2': 'লঞ্চ' },
}

function response(answers: Record<string, AnswerValue>): SurveyResponse {
  return {
    id: 'r1',
    questionnaireId: 'q1',
    serial: 1,
    surveyNumber: 'T-001',
    enumerator: 'Ikra',
    language: 'bn',
    answers,
    submittedAt: 1,
  }
}

describe('isSafeFieldName', () => {
  it('follows the names Convex accepts', () => {
    expect(['Time_A', 'Travel Cost', 'a7da2913-e697', 'x'].every(isSafeFieldName)).toBe(true)
    expect(['', '$set', '_id', 'ভ্রমণ', 'Every\n2 hrs', 'Cost–A'].some(isSafeFieldName)).toBe(false)
  })
})

describe('encodeAnswers', () => {
  it('leaves answers whose keys Convex accepts exactly as they were', () => {
    const answers: Record<string, AnswerValue> = {
      q1: 'opt-1',
      q2: ['opt-1', 'opt-2'],
      q3: null,
      q4: { scenarios: [plainScenario] },
      q5: { rows: [{ id: 'row-1', cells: { 'col-1': 'x', 'col-2': true } }] },
    }
    expect(encodeAnswers(answers)).toEqual(answers)
  })

  it('makes a response with Bangla column names storable, which it was not', () => {
    const answers: Record<string, AnswerValue> = { q1: { scenarios: [banglaScenario] } }
    const args = (encoded: unknown) =>
      ({ id: 'r1', questionnaireId: 'q1', enumerator: 'Ikra', language: 'bn', answers: encoded }) as Value

    expect(() => convexToJson(args(answers))).toThrow(/Field name/)
    expect(() => convexToJson(args(encodeAnswers(answers)))).not.toThrow()
  })

  it('only turns the maps with a refused key into pairs', () => {
    const encoded = encodeAnswers({ q1: { scenarios: [banglaScenario] } }) as {
      q1: { scenarios: Record<string, unknown>[] }
    }
    const [scenario] = encoded.q1.scenarios
    expect(scenario.levels).toEqual([
      { key: 'ভ্রমণ_ব্যয়_বাস', value: '২০০০ টাকা' },
      { key: 'ভ্রমণের_সময়_বাস', value: '৯ ঘন্টা' },
    ])
    // Prompt keys are generated ids, so these two stay records.
    expect(scenario.choices).toEqual({ 'prompt-1': 'বাস' })
    expect(scenario.other).toEqual({ 'prompt-2': 'লঞ্চ' })
    expect(scenario.set).toBe(3)
    expect(scenario.choice).toBe('বাস')
  })
})

describe('decodeResponse', () => {
  it('returns what was submitted, whichever way it travelled', () => {
    const answers: Record<string, AnswerValue> = {
      q1: { scenarios: [banglaScenario, plainScenario] },
      q2: { rows: [{ id: 'row-1', cells: { 'সময়': 'x' } }] },
      q3: 'opt-1',
    }
    const stored = response(encodeAnswers(answers) as Record<string, AnswerValue>)
    expect(decodeResponse(stored).answers).toEqual(answers)
  })

  it('reads responses stored before this encoding existed', () => {
    const old = response({ q1: { scenarios: [{ set: 2, levels: { Time_A: '5 Hours' }, choice: 'B' }] } })
    expect(decodeResponse(old)).toEqual(old)
    expect(decodeResponse({ ...old, answers: undefined as never }).answers).toEqual({})
  })
})

describe('scenario plan row', () => {
  it('survives the round trip, and is left out when the block drew its own cards', () => {
    const planned = {
      block: {
        planRow: 14,
        scenarios: [{ set: 3, levels: { 'ভ্রমণ ব্যয়_A': '১২০০ টাকা' }, choice: 'A' }],
      },
    }
    const encoded = encodeAnswers(planned as never)
    const answer = (encoded.block as { planRow: number; scenarios: { levels: unknown }[] })
    expect(answer.planRow).toBe(14)
    // The Bangla column name still travels as pairs; the plan row does not.
    expect(Array.isArray(answer.scenarios[0].levels)).toBe(true)

    const decoded = decodeResponse({ answers: encoded } as never)
    expect(decoded.answers.block).toEqual(planned.block)

    const drawn = { block: { scenarios: [{ set: 1, levels: { Cost_A: '100' }, choice: '' }] } }
    expect(encodeAnswers(drawn as never).block).not.toHaveProperty('planRow')
  })
})
