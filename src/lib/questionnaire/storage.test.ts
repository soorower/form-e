// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQuestionnaire } from './factory'
import {
  deleteQuestionnaire,
  getDeviceEnumerator,
  getQuestionnaire,
  listQuestionnaires,
  listResponses,
  nextSerial,
  saveQuestionnaire,
  saveResponse,
  setDeviceEnumerator,
} from './storage'

describe('storage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('round-trips a questionnaire', () => {
    const questionnaire = saveQuestionnaire(createQuestionnaire())
    expect(getQuestionnaire(questionnaire.id)?.id).toBe(questionnaire.id)
    expect(listQuestionnaires().map((q) => q.id)).toEqual([questionnaire.id])
    expect(getQuestionnaire('missing')).toBeNull()
  })

  it('updates in place and lists the most recently updated first', () => {
    vi.setSystemTime(1_000)
    const first = saveQuestionnaire(createQuestionnaire())
    vi.setSystemTime(2_000)
    const second = saveQuestionnaire(createQuestionnaire())
    expect(listQuestionnaires().map((q) => q.id)).toEqual([second.id, first.id])

    vi.setSystemTime(3_000)
    saveQuestionnaire({ ...first, title: { en: 'Renamed', bn: '' } })
    expect(listQuestionnaires()).toHaveLength(2)
    expect(listQuestionnaires().map((q) => q.id)).toEqual([first.id, second.id])
    expect(getQuestionnaire(first.id)?.title.en).toBe('Renamed')
  })

  it('numbers responses per questionnaire from the highest serial so far', () => {
    expect(nextSerial('q1')).toBe(1)
    saveResponse({ id: 'a', questionnaireId: 'q1', serial: 1, surveyNumber: 'X-001', enumerator: 'A', language: 'en', answers: {}, submittedAt: 1 })
    saveResponse({ id: 'b', questionnaireId: 'q2', serial: 7, surveyNumber: 'Y-007', enumerator: 'B', language: 'en', answers: {}, submittedAt: 2 })
    expect(nextSerial('q1')).toBe(2)
    expect(nextSerial('q2')).toBe(8)
  })

  it('gives legacy responses a zero serial and an empty enumerator', () => {
    window.localStorage.setItem(
      'forme:responses',
      JSON.stringify([{ id: 'old', questionnaireId: 'q1', language: 'en', answers: {}, submittedAt: 1 }]),
    )
    expect(listResponses('q1')[0]).toMatchObject({ serial: 0, surveyNumber: '', enumerator: '' })
    expect(nextSerial('q1')).toBe(1)
  })

  it('remembers the enumerator for the device', () => {
    expect(getDeviceEnumerator()).toBe('')
    setDeviceEnumerator('Ikra')
    expect(getDeviceEnumerator()).toBe('Ikra')
  })

  it('fills in the institution for questionnaires saved before it existed', () => {
    const legacy = createQuestionnaire() as Partial<ReturnType<typeof createQuestionnaire>>
    delete legacy.institution
    delete legacy.surveyCodePrefix
    delete legacy.enumerators
    window.localStorage.setItem('forme:questionnaires', JSON.stringify([legacy]))
    expect(getQuestionnaire(legacy.id!)).toMatchObject({
      institution: { en: '', bn: '' },
      surveyCodePrefix: '',
      enumerators: [],
    })
    expect(listQuestionnaires()[0].institution).toEqual({ en: '', bn: '' })
  })

  it('deleting a questionnaire also removes its responses', () => {
    const questionnaire = saveQuestionnaire(createQuestionnaire())
    saveResponse({
      id: 'r1',
      questionnaireId: questionnaire.id,
      serial: 1,
      surveyNumber: '001',
      enumerator: 'Nawal',
      language: 'en',
      answers: {},
      submittedAt: 1,
    })
    expect(listResponses(questionnaire.id)).toHaveLength(1)

    deleteQuestionnaire(questionnaire.id)
    expect(getQuestionnaire(questionnaire.id)).toBeNull()
    expect(listResponses(questionnaire.id)).toHaveLength(0)
  })
})
