import { describe, expect, it } from 'vitest'
import {
  answerScenario,
  isAnswered,
  normalizeTableAnswer,
  scenarioChoice,
  setScenarioOther,
} from './answers'
import { createPrompt, createQuestion } from './factory'
import type { TableQuestion } from './types'

function tableQuestion(): TableQuestion {
  const question = createQuestion('table')
  if (question.type !== 'table') throw new Error('expected a table question')
  return question
}

describe('isAnswered', () => {
  const text = createQuestion('short_text')
  const multi = createQuestion('multi_choice')

  it('treats empty values as unanswered', () => {
    expect(isAnswered(text, undefined)).toBe(false)
    expect(isAnswered(text, null)).toBe(false)
    expect(isAnswered(text, '   ')).toBe(false)
    expect(isAnswered(multi, [])).toBe(false)
  })

  it('accepts non-empty text and selections', () => {
    expect(isAnswered(text, 'Bus')).toBe(true)
    expect(isAnswered(multi, ['a'])).toBe(true)
  })

  it('requires at least one filled cell in a table', () => {
    const question = tableQuestion()
    const rowId = question.rows[0].id
    const columnId = question.columns[0].id
    const withCell = (cell: string | boolean) => ({ rows: [{ id: rowId, cells: { [columnId]: cell } }] })

    expect(isAnswered(question, { rows: [{ id: rowId, cells: {} }] })).toBe(false)
    expect(isAnswered(question, withCell(''))).toBe(false)
    expect(isAnswered(question, withCell(false))).toBe(false)
    expect(isAnswered(question, withCell('12'))).toBe(true)
    expect(isAnswered(question, withCell(true))).toBe(true)
  })
})

describe('normalizeTableAnswer', () => {
  it('creates one empty row per fixed row when there is no answer yet', () => {
    const question = tableQuestion()
    const answer = normalizeTableAnswer(question, undefined)
    expect(answer.rows.map((row) => row.id)).toEqual(question.rows.map((row) => row.id))
    expect(answer.rows.every((row) => Object.keys(row.cells).length === 0)).toBe(true)
  })

  it('keeps existing cells and appends respondent-added rows after the fixed rows', () => {
    const question = tableQuestion()
    const [first, second] = question.rows
    const columnId = question.columns[0].id
    const answer = normalizeTableAnswer(question, {
      rows: [
        { id: 'added-1', cells: { [columnId]: 'extra' } },
        { id: second.id, cells: { [columnId]: 'two' } },
      ],
    })
    expect(answer.rows.map((row) => row.id)).toEqual([first.id, second.id, 'added-1'])
    expect(answer.rows[1].cells[columnId]).toBe('two')
    expect(answer.rows[2].cells[columnId]).toBe('extra')
  })
})

describe('isAnswered for a choice experiment', () => {
  const block = createQuestion('choice_experiment')

  it('needs every drawn scenario to have a choice', () => {
    const levels = {}
    expect(isAnswered(block, { scenarios: [] })).toBe(false)
    expect(
      isAnswered(block, {
        scenarios: [
          { set: 1, levels, choice: 'A' },
          { set: 2, levels, choice: '' },
        ],
      }),
    ).toBe(false)
    expect(
      isAnswered(block, {
        scenarios: [
          { set: 1, levels, choice: 'A' },
          { set: 2, levels, choice: 'B' },
        ],
      }),
    ).toBe(true)
  })
})

describe('scenario answers with several questions', () => {
  const first = createPrompt('alternative')
  const second = createPrompt('options')

  it('records each question by its key and mirrors the first into `choice`', () => {
    const scenario = { set: 4, levels: {}, choice: '' }
    const afterFirst = answerScenario(scenario, first, 0, 'Bus')
    expect(afterFirst.choice).toBe('Bus')
    expect(afterFirst.choices).toEqual({ [first.key]: 'Bus' })
    const afterSecond = answerScenario(afterFirst, second, 1, 'other')
    expect(afterSecond.choice).toBe('Bus')
    expect(afterSecond.choices).toEqual({ [first.key]: 'Bus', [second.key]: 'other' })
    const typed = setScenarioOther(afterSecond, second, 'Motorcycle')
    expect(typed.other).toEqual({ [second.key]: 'Motorcycle' })
  })

  it('falls back to `choice` for the first question of an older response', () => {
    const legacy = { set: 1, levels: {}, choice: 'A' }
    expect(scenarioChoice(legacy, first, 0)).toBe('A')
    expect(scenarioChoice(legacy, second, 1)).toBe('')
  })
})

describe('isAnswered for a choice block with several questions', () => {
  it('needs every question of every scenario answered', () => {
    const block = createQuestion('choice_experiment')
    if (block.type !== 'choice_experiment') throw new Error('expected a choice experiment')
    const [first] = block.prompts
    const second = createPrompt('options')
    block.prompts = [first, second]
    const scenario = { set: 1, levels: {}, choice: '' }
    expect(isAnswered(block, { scenarios: [] })).toBe(false)
    expect(isAnswered(block, { scenarios: [answerScenario(scenario, first, 0, 'A')] })).toBe(false)
    const full = answerScenario(answerScenario(scenario, first, 0, 'A'), second, 1, 'yes')
    expect(isAnswered(block, { scenarios: [full] })).toBe(true)
    // An older single-answer response still counts for a single-prompt block.
    block.prompts = [first]
    expect(isAnswered(block, { scenarios: [{ set: 1, levels: {}, choice: 'A' }] })).toBe(true)
  })
})
