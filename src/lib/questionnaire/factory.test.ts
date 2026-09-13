import { describe, expect, it } from 'vitest'
import {
  QUESTION_TYPES,
  activeEnumerators,
  createQuestion,
  createQuestionnaire,
  duplicateQuestion,
  formatSurveyNumber,
  pickText,
} from './factory'

describe('createQuestion', () => {
  it('builds every question type with its type-specific fields', () => {
    for (const { type } of QUESTION_TYPES) {
      const question = createQuestion(type)
      expect(question.type).toBe(type)
      // A choice block asks respondents to pick in every scenario, so it starts required.
      expect(question.required).toBe(type === 'choice_experiment')
      if (question.type === 'choice_experiment') {
        expect(question.cards).toEqual([])
        expect(question.scenariosPerRespondent).toBe(3)
        expect(question.prompt.bn).not.toBe('')
      }
      if (
        question.type === 'single_choice' ||
        question.type === 'multi_choice' ||
        question.type === 'dropdown'
      ) {
        expect(question.options.length).toBeGreaterThan(0)
      }
      if (question.type === 'table') {
        expect(question.rows.length).toBeGreaterThan(0)
        expect(question.columns.length).toBeGreaterThan(0)
        expect(question.allowAddRows).toBe(false)
      }
    }
  })
})

describe('duplicateQuestion', () => {
  it('copies table content but assigns fresh ids throughout', () => {
    const original = createQuestion('table')
    if (original.type !== 'table') throw new Error('expected a table question')
    original.columns[0].input = 'dropdown'
    original.columns[0].options = [{ id: 'opt', label: { en: 'Bus', bn: 'বাস' } }]

    const copy = duplicateQuestion(original)
    if (copy.type !== 'table') throw new Error('expected a table question')

    expect(copy.id).not.toBe(original.id)
    expect(copy.rows.map((row) => row.id)).not.toEqual(original.rows.map((row) => row.id))
    expect(copy.columns.map((c) => c.id)).not.toEqual(original.columns.map((c) => c.id))
    expect(copy.columns[0].options[0].id).not.toBe('opt')
    expect(copy.columns[0].options[0].label).toEqual({ en: 'Bus', bn: 'বাস' })
    expect(copy.rows.map((row) => row.label)).toEqual(original.rows.map((row) => row.label))
  })

  it('gives choice questions new option ids', () => {
    const original = createQuestion('dropdown')
    const copy = duplicateQuestion(original)
    if (original.type !== 'dropdown' || copy.type !== 'dropdown') {
      throw new Error('expected dropdown questions')
    }
    expect(copy.options.map((o) => o.id)).not.toEqual(original.options.map((o) => o.id))
    expect(copy.options.map((o) => o.label)).toEqual(original.options.map((o) => o.label))
  })
})

describe('pickText', () => {
  it('returns the requested language and falls back to the other one', () => {
    expect(pickText({ en: 'Bus', bn: 'বাস' }, 'bn')).toBe('বাস')
    expect(pickText({ en: 'Bus', bn: '' }, 'bn')).toBe('Bus')
    expect(pickText({ en: '', bn: 'বাস' }, 'en')).toBe('বাস')
    expect(pickText({ en: '', bn: '' }, 'en')).toBe('')
  })
})

describe('createQuestionnaire', () => {
  it('starts in English with no questions or logo', () => {
    const questionnaire = createQuestionnaire()
    expect(questionnaire.languages).toEqual(['en'])
    expect(questionnaire.defaultLanguage).toBe('en')
    expect(questionnaire.questions).toEqual([])
    expect(questionnaire.logo).toBeNull()
    expect(questionnaire.institution).toEqual({ en: '', bn: '' })
    expect(questionnaire.surveyCodePrefix).toBe('')
    expect(questionnaire.enumerators).toEqual([])
  })
})

describe('survey numbers and team', () => {
  it('pads the serial to three digits after the prefix', () => {
    expect(formatSurveyNumber('ACBUS-', 7)).toBe('ACBUS-007')
    expect(formatSurveyNumber('', 1234)).toBe('1234')
  })

  it('ignores blank team member rows', () => {
    expect(activeEnumerators({ enumerators: [' Nawal ', '', 'Ikra', '  '] })).toEqual(['Nawal', 'Ikra'])
  })

  it('drops duplicate names, which responses could not be told apart by anyway', () => {
    expect(
      activeEnumerators({ enumerators: ['Ikra', 'Nawal', ' Ikra ', 'Sorower'] }),
    ).toEqual(['Ikra', 'Nawal', 'Sorower'])
  })
})
