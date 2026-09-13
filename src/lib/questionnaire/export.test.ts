import { describe, expect, it } from 'vitest'
import { parseCardTable, EXAMPLE_CARD_TABLE } from './cards'
import { exportColumns, responsesToRows, toCsv } from './export'
import { createQuestion, createQuestionnaire } from './factory'
import type { Questionnaire, SurveyResponse } from './types'

function buildQuestionnaire(): Questionnaire {
  const gender = createQuestion('single_choice')
  if (gender.type !== 'single_choice') throw new Error('expected single choice')
  gender.id = 'gender'
  gender.label = { en: 'Gender', bn: 'জেন্ডার' }
  gender.options = [
    { id: 'm', label: { en: '1) Male', bn: '১) পুরুষ' } },
    { id: 'f', label: { en: '2) Female', bn: '২) নারী' } },
  ]

  const cost = createQuestion('number')
  cost.id = 'cost'
  cost.label = { en: 'One-way cost', bn: '' }

  const block = createQuestion('choice_experiment')
  if (block.type !== 'choice_experiment') throw new Error('expected a choice experiment')
  block.id = 'block'
  block.label = { en: 'Time, cost and reliability', bn: '' }
  const { attributes, alternatives, cards } = parseCardTable(EXAMPLE_CARD_TABLE)
  Object.assign(block, { attributes, alternatives, cards, scenariosPerRespondent: 2 })

  const wtp = createQuestion('short_text')
  wtp.id = 'wtp'
  wtp.label = { en: 'Willingness to pay', bn: '' }

  return { ...createQuestionnaire(), questions: [gender, cost, block, wtp] }
}

const response: SurveyResponse = {
  id: 'r1',
  questionnaireId: 'q',
  serial: 7,
  surveyNumber: 'ACBUS-007',
  enumerator: 'Nawal',
  language: 'bn',
  submittedAt: Date.UTC(2026, 8, 10, 12, 0, 0),
  answers: {
    gender: 'm',
    cost: '1500',
    block: {
      scenarios: [
        { set: 4, levels: { Time_A: '5 Hours', Cost_A: '1800 Taka', Time_B: '9 Hours', Cost_B: '1800 Taka' }, choice: 'B' },
        { set: 1, levels: { Time_A: '5 Hours', Cost_A: '1800 Taka', Time_B: '7 Hours', Cost_B: '1250 Taka' }, choice: 'A' },
      ],
    },
    wtp: '200',
  },
}

describe('responsesToRows', () => {
  it('writes one row per scenario with the respondent columns repeated', () => {
    const questionnaire = buildQuestionnaire()
    const rows = responsesToRows(questionnaire, [response])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      'Response ID': 'r1',
      'Survey no.': 'ACBUS-007',
      Enumerator: 'Nawal',
      'Submitted at': '2026-09-10T12:00:00.000Z',
      Language: 'bn',
      '1. Gender': '1) Male',
      '2. One-way cost': '1500',
      '5. Willingness to pay': '200',
      Block: 'Time, cost and reliability',
      Question: 3,
      Scenario: 1,
      Set: 4,
      Time_A: '5 Hours',
      Cost_B: '1800 Taka',
      Choice: 'B',
    })
    expect(rows[1]).toMatchObject({ Question: 4, Scenario: 2, Set: 1, Choice: 'A' })
    expect(rows[0].Reliability_A).toBe('')
  })

  it('uses the requested language for option text', () => {
    const rows = responsesToRows(buildQuestionnaire(), [response], 'bn')
    expect(rows[0]['1. জেন্ডার']).toBe('১) পুরুষ')
  })

  it('keeps a single row for a response without scenarios', () => {
    const questionnaire = buildQuestionnaire()
    const rows = responsesToRows(questionnaire, [{ ...response, answers: { gender: 'f' } }])
    expect(rows).toHaveLength(1)
    expect(rows[0]['1. Gender']).toBe('2) Female')
    expect(rows[0].Choice).toBeUndefined()
  })
})

describe('profile layout export', () => {
  it('writes plain level columns and the chosen answer by its English label', () => {
    const block = createQuestion('choice_experiment')
    if (block.type !== 'choice_experiment') throw new Error('expected a choice experiment')
    const design = parseCardTable('Card ID\tDistance\tParking\n1\t5 km\tFree\n2\t1 km\tNo')
    Object.assign(block, {
      id: 'mall',
      label: { en: 'New shopping mall', bn: '' },
      layout: design.layout,
      attributes: design.attributes,
      alternatives: design.alternatives,
      cards: design.cards,
      scenariosPerRespondent: 1,
    })
    const questionnaire = { ...createQuestionnaire(), questions: [block] }
    const rows = responsesToRows(questionnaire, [
      {
        ...response,
        answers: {
          mall: { scenarios: [{ set: 2, levels: { Distance: '1 km', Parking: 'No' }, choice: 'yes' }] },
        },
      },
    ])
    expect(rows[0]).toMatchObject({ Set: 2, Distance: '1 km', Parking: 'No', Choice: 'Yes' })
    expect(exportColumns(questionnaire, rows).slice(-3)).toEqual(['Distance', 'Parking', 'Choice'])
  })
})

describe('exportColumns and toCsv', () => {
  it('orders respondent columns first and the choice design columns last', () => {
    const questionnaire = buildQuestionnaire()
    const rows = responsesToRows(questionnaire, [response])
    const columns = exportColumns(questionnaire, rows)
    expect(columns.slice(0, 8)).toEqual([
      'Response ID',
      'Survey no.',
      'Enumerator',
      'Submitted at',
      'Language',
      '1. Gender',
      '2. One-way cost',
      '5. Willingness to pay',
    ])
    expect(columns.slice(8, 12)).toEqual(['Block', 'Question', 'Scenario', 'Set'])
    expect(columns.at(-1)).toBe('Choice')
    expect(columns).toContain('Reliability_B')
  })

  it('quotes cells that contain commas, quotes, or line breaks and starts with a BOM', () => {
    const csv = toCsv(['a', 'b'], [{ a: 'x,y', b: 'multi\nline "q"' }])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.slice(1)).toBe('a,b\r\n"x,y","multi\nline ""q"""\r\n')
  })
})
