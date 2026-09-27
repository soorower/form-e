// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createQuestion, createQuestionnaire, text } from '#/lib/questionnaire/factory'
import type { PendingResponse } from '#/lib/questionnaire/outbox'
import type { TextQuestion } from '#/lib/questionnaire/types'
import { backupJson, backupWorkbook, parseBackupJson, readBackupFile } from './backup'
import {
  noteSerialTaken,
  offlineSerial,
  readOfflineSurvey,
  saveOfflineSurvey,
} from './surveys'
import { freshOfflineDb } from './testing'

function pending(id: string, extra: Partial<PendingResponse> = {}): PendingResponse {
  return {
    id,
    questionnaireId: 'acbus',
    enumerator: 'Ikra',
    language: 'bn',
    answers: { occupation: 'শিক্ষক' },
    queuedAt: 1_700_000_000_000,
    ...extra,
  }
}

describe('offlineSerial', () => {
  const kit = { start: 101, end: 200, taken: [101, 102] }

  it('takes the next free number of the block, skipping those still waiting on the tablet', () => {
    expect(offlineSerial(kit, 'acbus', [])).toBe(103)
    expect(offlineSerial(kit, 'acbus', [pending('a', { claimedSerial: 103 })])).toBe(104)
    // Paper forms typed in here hold their printed number too.
    expect(offlineSerial(kit, 'acbus', [pending('a', { paperSerial: 103 })])).toBe(104)
    // Another survey's responses have numbers of their own.
    expect(
      offlineSerial(kit, 'acbus', [pending('a', { questionnaireId: 'other', claimedSerial: 103 })]),
    ).toBe(103)
  })

  it('has no number without a block, or once the block is full', () => {
    expect(offlineSerial(null, 'acbus', [])).toBeNull()
    expect(offlineSerial({ start: 1, end: 2, taken: [1, 2] }, 'acbus', [])).toBeNull()
  })
})

describe('saved surveys', () => {
  beforeEach(freshOfflineDb)

  it('merges what is saved, and learns numbers the server recorded', async () => {
    await saveOfflineSurvey('acbus', { stored: { id: 'acbus' }, savedAt: 1 })
    await saveOfflineSurvey('acbus', { kit: { start: 101, end: 200, taken: [101] }, kitOwner: 'u1' })
    await noteSerialTaken('acbus', 105)
    // Outside the block: not its business.
    await noteSerialTaken('acbus', 7)
    const saved = await readOfflineSurvey('acbus')
    expect(saved).toMatchObject({ stored: { id: 'acbus' }, kitOwner: 'u1' })
    expect(saved?.kit?.taken).toEqual([101, 105])
  })

  it('saves nothing but a survey itself for a survey it has never seen', async () => {
    expect(await saveOfflineSurvey('new', { kit: null })).toBe(false)
    expect(await readOfflineSurvey('new')).toBeNull()
  })

  it('keeps every part when several saves overlap', async () => {
    await Promise.all([
      saveOfflineSurvey('acbus', { stored: { id: 'acbus' }, savedAt: 1 }),
      saveOfflineSurvey('acbus', { kit: { start: 1, end: 9, taken: [] } }),
      saveOfflineSurvey('acbus', { missingPictures: 2 }),
    ])
    expect(await readOfflineSurvey('acbus')).toMatchObject({
      kit: { start: 1, end: 9 },
      missingPictures: 2,
    })
  })
})

describe('backup of unsent responses', () => {
  const responses = [
    pending('r1', { claimedSerial: 103, surveyNumber: 'ACBUS-103', surveyorId: 'u1' }),
    pending('r2', { paperSerial: 150 }),
  ]

  it('reads back what the JSON file holds', () => {
    expect(parseBackupJson(backupJson(responses))).toEqual(responses)
  })

  it('refuses a file that is not a backup', () => {
    expect(() => parseBackupJson('{"hello":1}')).toThrow(/not a Form-E backup/)
    expect(() => parseBackupJson('not json')).toThrow(/not a Form-E backup/)
  })

  it('carries the same responses inside the Excel file, Bangla included', async () => {
    const questionnaire = {
      ...createQuestionnaire(),
      id: 'acbus',
      surveyCodePrefix: 'ACBUS-',
      questions: [
        { ...(createQuestion('short_text') as TextQuestion), id: 'occupation', label: text('Occupation') },
      ],
    }
    const buffer = await backupWorkbook(responses, new Map([['acbus', questionnaire]]))
    const file = new File([buffer], 'forme-unsent-responses.xlsx')
    expect(await readBackupFile(file)).toEqual(responses)
  })
})
