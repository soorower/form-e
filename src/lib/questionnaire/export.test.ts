import { describe, expect, it } from 'vitest'
import { parseCardTable, EXAMPLE_CARD_TABLE, EXAMPLE_TWO_ROW_CARD_TABLE } from './cards'
import {
  countByEnumerator,
  exportColumns,
  exportFileName,
  filterByEnumerator,
  responsesToRows,
  toCsv,
} from './export'
import { createPrompt, createQuestion, createQuestionnaire, text } from './factory'
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

describe('several questions under each scenario', () => {
  function accessEgressBlock() {
    const block = createQuestion('choice_experiment')
    if (block.type !== 'choice_experiment') throw new Error('expected a choice experiment')
    const design = parseCardTable(EXAMPLE_TWO_ROW_CARD_TABLE)
    const mode = createPrompt('options', text('Which mode would you use?'))
    mode.key = 'mode'
    mode.options = [
      { key: 'bus-ac', label: text('Bus (AC)', 'বাস (এসি)') },
      { key: 'train', label: text('Train', 'ট্রেন') },
    ]
    mode.allowOther = true
    const access = createPrompt('alternative', text('Which column for the access trip?'))
    access.key = 'access'
    Object.assign(block, {
      id: 'sp',
      label: { en: 'Sylhet to Dhaka', bn: '' },
      layout: design.layout,
      attributes: design.attributes,
      alternatives: design.alternatives,
      cards: design.cards,
      scenariosPerRespondent: 2,
      prompts: [mode, access],
    })
    return block
  }

  it('writes one Choice column per question, numbers scenarios by question count, and keeps the Other text', () => {
    const block = accessEgressBlock()
    const age = createQuestion('number')
    age.id = 'age'
    age.label = { en: 'Age', bn: '' }
    const questionnaire = { ...createQuestionnaire(), questions: [age, block] }
    const rows = responsesToRows(questionnaire, [
      {
        ...response,
        answers: {
          age: '31',
          sp: {
            scenarios: [
              {
                set: 3,
                levels: { Travel_Cost_Bus: 'x' },
                choice: 'other',
                choices: { mode: 'other', access: 'Train' },
                other: { mode: 'Motorcycle' },
              },
              {
                set: 1,
                levels: { Travel_Cost_Bus: 'y' },
                choice: 'bus-ac',
                choices: { mode: 'bus-ac', access: 'Air' },
              },
            ],
          },
        },
      },
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      '1. Age': '31',
      Question: 2,
      Scenario: 1,
      Set: 3,
      Choice: 'Other',
      'Choice (other)': 'Motorcycle',
      'Choice 2': 'Train',
    })
    expect(rows[1]).toMatchObject({ Question: 4, Scenario: 2, Choice: 'Bus (AC)', 'Choice (other)': '', 'Choice 2': 'Air' })
    expect(exportColumns(questionnaire, rows).slice(-3)).toEqual(['Choice', 'Choice (other)', 'Choice 2'])
  })

  it('reads the first question’s answer from `choice` on responses recorded before blocks asked several', () => {
    const block = accessEgressBlock()
    const questionnaire = { ...createQuestionnaire(), questions: [block] }
    const rows = responsesToRows(questionnaire, [
      { ...response, answers: { sp: { scenarios: [{ set: 1, levels: {}, choice: 'train' }] } } },
    ])
    expect(rows[0].Choice).toBe('Train')
    expect(rows[0]['Choice 2']).toBe('')
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

describe('responses of one enumerator', () => {
  const collected = ['Ikra', ' Ikra ', 'Nawal', '', '  ', 'Ikra', 'ইকরা'].map((enumerator) => ({
    enumerator,
  }))

  it('counts by trimmed name, the most first, with the unnamed ones together', () => {
    expect(countByEnumerator(collected)).toEqual([
      ['Ikra', 3],
      ['', 2],
      ['Nawal', 1],
      ['ইকরা', 1],
    ])
  })

  it('keeps one person, the unnamed ones, or everybody', () => {
    expect(filterByEnumerator(collected, 'Ikra')).toHaveLength(3)
    expect(filterByEnumerator(collected, '')).toHaveLength(2)
    expect(filterByEnumerator(collected, 'Tourat')).toEqual([])
    expect(filterByEnumerator(collected, null)).toBe(collected)
  })

  it('names a one-person download after that person', () => {
    const questionnaire = { ...createQuestionnaire(), title: text('AC Bus: Sylhet–Dhaka') }
    const date = new Date().toISOString().slice(0, 10)
    expect(exportFileName(questionnaire, 'csv')).toBe(`ac-bus-sylhetdhaka-responses-${date}.csv`)
    expect(exportFileName(questionnaire, 'csv', 'Ikra')).toBe(
      `ac-bus-sylhetdhaka-responses-ikra-${date}.csv`,
    )
    expect(exportFileName(questionnaire, 'xlsx', 'Md. Tourat / B')).toBe(
      `ac-bus-sylhetdhaka-responses-md-tourat-b-${date}.xlsx`,
    )
    expect(exportFileName(questionnaire, 'json', 'ইকরা')).toBe(
      `ac-bus-sylhetdhaka-responses-ইকরা-${date}.json`,
    )
    expect(exportFileName(questionnaire, 'json', '')).toBe(
      `ac-bus-sylhetdhaka-responses-no-name-${date}.json`,
    )
  })
})

describe('multiple-choice answers', () => {
  /** A survey whose one question is "tick every mode you used". */
  function withModes(): Questionnaire {
    const modes = createQuestion('multi_choice')
    if (modes.type !== 'multi_choice') throw new Error('expected multiple choice')
    modes.id = 'modes'
    modes.label = { en: 'Modes used', bn: '' }
    modes.options = [
      { id: 'bus', label: { en: 'Bus', bn: 'বাস' } },
      { id: 'train', label: { en: 'Train', bn: 'ট্রেন' } },
      { id: 'car', label: { en: 'Car', bn: 'কার' } },
    ]
    return { ...createQuestionnaire(), questions: [modes] }
  }

  const ticked = (id: string, modes: string[]): SurveyResponse => ({
    id,
    questionnaireId: 'q',
    serial: 1,
    surveyNumber: 'M-001',
    enumerator: 'Nawal',
    language: 'en',
    submittedAt: Date.UTC(2026, 8, 10),
    answers: { modes },
  })

  it('gives every selection its own column', () => {
    const questionnaire = withModes()
    const rows = responsesToRows(questionnaire, [ticked('r1', ['bus', 'car'])])
    expect(rows[0]['1. Modes used (1)']).toBe('Bus')
    expect(rows[0]['1. Modes used (2)']).toBe('Car')
    expect(exportColumns(questionnaire, rows)).toContain('1. Modes used (2)')
  })

  it('numbers the columns in the question order, not the tapping order', () => {
    const rows = responsesToRows(withModes(), [ticked('r1', ['car', 'bus'])])
    expect(rows[0]['1. Modes used (1)']).toBe('Bus')
    expect(rows[0]['1. Modes used (2)']).toBe('Car')
  })

  it('makes as many columns as the widest answer needs, and leaves the rest blank', () => {
    const questionnaire = withModes()
    const rows = responsesToRows(questionnaire, [
      ticked('r1', ['bus']),
      ticked('r2', ['bus', 'train', 'car']),
    ])
    const columns = exportColumns(questionnaire, rows)
    expect(columns.filter((column) => column.startsWith('1. Modes used'))).toEqual([
      '1. Modes used (1)',
      '1. Modes used (2)',
      '1. Modes used (3)',
    ])
    expect(rows[0]['1. Modes used (2)']).toBe('')
    expect(rows[1]['1. Modes used (3)']).toBe('Car')
  })

  it('keeps every selection when options were deleted after the responses came in', () => {
    const questionnaire = withModes()
    const collected = [ticked('r1', ['bus', 'train', 'car'])]
    // The creator later cuts the question down to one option. The two answers
    // that no longer have an option must still reach the file, under their id.
    const modes = questionnaire.questions[0]
    if (modes.type !== 'multi_choice') throw new Error('expected multiple choice')
    const trimmed: Questionnaire = {
      ...questionnaire,
      questions: [{ ...modes, options: [{ id: 'bus', label: text('Bus') }] }],
    }
    const rows = responsesToRows(trimmed, collected)
    expect(exportColumns(trimmed, rows).filter((c) => c.startsWith('1. Modes used'))).toHaveLength(3)
    expect(rows[0]['1. Modes used (1)']).toBe('Bus')
    expect(rows[0]['1. Modes used (2)']).toBe('train')
    expect(rows[0]['1. Modes used (3)']).toBe('car')
  })

  it('keeps one column when nobody ticked anything', () => {
    const questionnaire = withModes()
    const rows = responsesToRows(questionnaire, [ticked('r1', [])])
    expect(exportColumns(questionnaire, rows).filter((c) => c.startsWith('1. Modes used'))).toEqual([
      '1. Modes used (1)',
    ])
  })
})

describe('respondent details', () => {
  function withDetails(): Questionnaire {
    const trips = createQuestion('short_text')
    trips.id = 'trips'
    trips.label = { en: 'Trips per week', bn: '' }
    return {
      ...createQuestionnaire(),
      questions: [trips],
      respondent: {
        fields: [
          { key: 'name', required: true },
          { key: 'phone', required: false },
        ],
        note: text(),
      },
    }
  }

  const withRespondent: SurveyResponse = {
    id: 'r1',
    questionnaireId: 'q',
    serial: 1,
    surveyNumber: 'R-001',
    enumerator: 'Nawal',
    language: 'en',
    respondent: { name: 'Karim Uddin', phone: '01711111111' },
    submittedAt: Date.UTC(2026, 8, 10),
    answers: { trips: '3' },
  }

  it('puts the details asked for right after the enumerator', () => {
    const questionnaire = withDetails()
    const rows = responsesToRows(questionnaire, [withRespondent])
    expect(exportColumns(questionnaire, rows).slice(0, 5)).toEqual([
      'Response ID',
      'Survey no.',
      'Enumerator',
      'Respondent name',
      'Respondent phone',
    ])
    expect(rows[0]['Respondent name']).toBe('Karim Uddin')
  })

  it('keeps the column for a detail left blank, and none for details not asked for', () => {
    const questionnaire = withDetails()
    const rows = responsesToRows(questionnaire, [
      { ...withRespondent, respondent: { name: 'Karim Uddin' } },
    ])
    expect(rows[0]['Respondent phone']).toBe('')
    expect(exportColumns(questionnaire, rows)).not.toContain('Respondent email')
  })

  it('adds no respondent columns to a survey that asks for none', () => {
    const questionnaire = { ...withDetails(), respondent: { fields: [], note: text() } }
    const rows = responsesToRows(questionnaire, [withRespondent])
    expect(exportColumns(questionnaire, rows)).not.toContain('Respondent name')
  })
})

describe('scenario plan in the export', () => {
  it('records which plan row the interview was given, beside the card set', () => {
    const questionnaire = buildQuestionnaire()
    const planned: SurveyResponse = {
      ...response,
      answers: {
        ...response.answers,
        block: {
          planRow: 14,
          scenarios: [
            { set: 4, levels: { Time_A: '5 Hours' }, choice: 'B' },
            { set: 1, levels: { Time_A: '5 Hours' }, choice: 'A' },
          ],
        },
      },
    }
    const rows = responsesToRows(questionnaire, [planned])
    expect(rows.map((row) => row['Plan row'])).toEqual([14, 14])
    const columns = exportColumns(questionnaire, rows)
    expect(columns.indexOf('Plan row')).toBeLessThan(columns.indexOf('Scenario'))
  })

  it('leaves the column out for a block that draws its own cards', () => {
    const questionnaire = buildQuestionnaire()
    const rows = responsesToRows(questionnaire, [response])
    expect(exportColumns(questionnaire, rows)).not.toContain('Plan row')
  })
})
