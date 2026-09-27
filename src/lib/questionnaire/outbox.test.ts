// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { freshOfflineDb } from '#/lib/offline/testing'
import {
  clearRefused,
  markRefused,
  onOutboxChange,
  queueResponse,
  readOutbox,
  removeFromOutbox,
  type PendingResponse,
} from './outbox'

function pending(
  id: string,
  answers: PendingResponse['answers'] = { q1: 'a' },
  queuedAt = 1,
): PendingResponse {
  return { id, questionnaireId: 'acbus', enumerator: 'Ikra', language: 'bn', answers, queuedAt }
}

describe('outbox', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    vi.restoreAllMocks()
    await freshOfflineDb()
  })

  it('keeps a response until the server has confirmed it', async () => {
    expect(await readOutbox()).toEqual([])
    expect(await queueResponse(pending('r1', { q1: 'a' }, 1))).toBe(true)
    expect(await queueResponse(pending('r2', { q1: 'a' }, 2))).toBe(true)
    expect((await readOutbox()).map((response) => response.id)).toEqual(['r1', 'r2'])

    await removeFromOutbox('r1')
    expect((await readOutbox()).map((response) => response.id)).toEqual(['r2'])
    await removeFromOutbox('missing')
    expect(await readOutbox()).toHaveLength(1)
  })

  it('holds one copy when the same interview is submitted again', async () => {
    await queueResponse(pending('r1', { q1: 'first try' }))
    await queueResponse(pending('r1', { q1: 'second try' }))
    expect(await readOutbox()).toEqual([pending('r1', { q1: 'second try' })])
  })

  it('keeps a refused copy with its reason until it is put back in line', async () => {
    await queueResponse(pending('r1'))
    await markRefused('r1', 'This survey no longer exists.')
    expect((await readOutbox())[0].refused).toBe('This survey no longer exists.')
    await clearRefused()
    expect((await readOutbox())[0].refused).toBeUndefined()
  })

  it('moves an outbox left in localStorage by an older version into IndexedDB', async () => {
    window.localStorage.setItem('forme:outbox', JSON.stringify([pending('old')]))
    expect((await readOutbox()).map((response) => response.id)).toEqual(['old'])
    expect(window.localStorage.getItem('forme:outbox')).toBeNull()
    // Still there on the next read, now from IndexedDB.
    expect(await readOutbox()).toHaveLength(1)
  })

  it('survives an unreadable legacy outbox', async () => {
    window.localStorage.setItem('forme:outbox', '{not json')
    expect(await readOutbox()).toEqual([])
  })

  it('tells listeners when it changes', async () => {
    const listener = vi.fn()
    const stop = onOutboxChange(listener)
    await queueResponse(pending('r1'))
    await removeFromOutbox('r1')
    expect(listener).toHaveBeenCalledTimes(2)
    stop()
    await queueResponse(pending('r2'))
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('falls back to localStorage where IndexedDB cannot be opened', async () => {
    const saved = globalThis.indexedDB
    // @ts-expect-error: a browser without IndexedDB
    delete globalThis.indexedDB
    try {
      const { closeOfflineDb } = await import('#/lib/offline/db')
      await closeOfflineDb()
      expect(await queueResponse(pending('r1'))).toBe(true)
      expect((await readOutbox()).map((response) => response.id)).toEqual(['r1'])
      expect(window.localStorage.getItem('forme:db:outbox')).toContain('r1')
    } finally {
      globalThis.indexedDB = saved
    }
  })
})
