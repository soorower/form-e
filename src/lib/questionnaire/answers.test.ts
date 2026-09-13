import { describe, expect, it } from 'vitest'
import { isAnswered, normalizeTableAnswer } from './answers'
import { createQuestion } from './factory'
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
