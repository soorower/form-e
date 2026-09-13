import { describe, expect, it } from 'vitest'
import { Workbook } from 'exceljs'
import { EXAMPLE_CARD_TABLE, parseCardTable } from './cards'
import { exportColumns, responsesToRows } from './export'
import { buildResponsesWorkbook } from './export-xlsx'
import { createQuestion, createQuestionnaire } from './factory'
import type { Questionnaire, SurveyResponse } from './types'

function buildQuestionnaire(): Questionnaire {
  const cost = createQuestion('number')
  cost.id = 'cost'
  cost.label = { en: 'One-way cost', bn: 'খরচ' }

  const block = createQuestion('choice_experiment')
  if (block.type !== 'choice_experiment') throw new Error('expected a choice experiment')
  block.id = 'block'
  block.label = { en: 'Time, cost and reliability', bn: '' }
  const { attributes, alternatives, cards } = parseCardTable(EXAMPLE_CARD_TABLE)
  Object.assign(block, { attributes, alternatives, cards, scenariosPerRespondent: 2 })

  return { ...createQuestionnaire(), questions: [cost, block] }
}

const response: SurveyResponse = {
  id: 'r1',
  questionnaireId: 'q',
  serial: 12,
  surveyNumber: '012',
  enumerator: 'Ikra',
  language: 'en',
  submittedAt: Date.UTC(2026, 8, 10),
  answers: {
    cost: '1500',
    block: {
      scenarios: [
        { set: 4, levels: { Time_A: '5 Hours', Cost_A: '1800 Taka' }, choice: 'B' },
        { set: 1, levels: { Time_A: '5 Hours', Cost_A: '1800 Taka' }, choice: 'A' },
      ],
    },
  },
}

describe('buildResponsesWorkbook', () => {
  it('writes responses, design cards, and questions sheets that Excel can read back', async () => {
    const questionnaire = buildQuestionnaire()
    const rows = responsesToRows(questionnaire, [response], 'en')
    const columns = exportColumns(questionnaire, rows)

    const buffer = await buildResponsesWorkbook(questionnaire, columns, rows, 'en')
    const workbook = new Workbook()
    await workbook.xlsx.load(buffer)

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Responses',
      'Design cards',
      'Questions',
    ])

    const responses = workbook.getWorksheet('Responses')!
    expect(responses.getRow(1).values).toEqual([undefined, ...columns])
    expect(responses.rowCount).toBe(3)
    const costColumn = columns.indexOf('1. One-way cost') + 1
    expect(responses.getRow(2).getCell(costColumn).value).toBe(1500)
    expect(responses.getRow(2).getCell(columns.indexOf('Set') + 1).value).toBe(4)
    expect(responses.getRow(3).getCell(columns.indexOf('Choice') + 1).value).toBe('A')
    expect(responses.getRow(2).getCell(1).value).toBe('r1')
    // Survey numbers stay text even when they look numeric, so "012" keeps its zeros.
    expect(responses.getRow(2).getCell(columns.indexOf('Survey no.') + 1).value).toBe('012')
    expect(responses.getRow(2).getCell(columns.indexOf('Enumerator') + 1).value).toBe('Ikra')
    expect(responses.getRow(1).font.bold).toBe(true)

    const cards = workbook.getWorksheet('Design cards')!
    expect(String(cards.getRow(1).getCell(1).value)).toContain('Time, cost and reliability')
    expect(cards.getRow(2).values).toEqual([
      undefined,
      'Set',
      'Time_A',
      'Cost_A',
      'Reliability_A',
      'Time_B',
      'Cost_B',
      'Reliability_B',
    ])
    expect(cards.getRow(3).getCell(1).value).toBe(1)
    expect(cards.getRow(7).getCell(2).value).toBe('9 Hours')

    const questions = workbook.getWorksheet('Questions')!
    expect(questions.getRow(2).getCell(1).value).toBe('1')
    expect(questions.getRow(3).getCell(1).value).toBe('2–3')
    expect(String(questions.getRow(3).getCell(5).value)).toContain('5 cards, 2 per respondent')
  })
})
