// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queueResponse, readOutbox, removeFromOutbox, type PendingResponse } from './outbox'

function pending(id: string, answers: PendingResponse['answers'] = { q1: 'a' }): PendingResponse {
  return { id, questionnaireId: 'acbus', enumerator: 'Ikra', language: 'bn', answers, queuedAt: 1 }
}

describe('outbox', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('keeps a response until the server has confirmed it', () => {
    expect(readOutbox()).toEqual([])
    expect(queueResponse(pending('r1'))).toBe(true)
    expect(queueResponse(pending('r2'))).toBe(true)
    expect(readOutbox().map((response) => response.id)).toEqual(['r1', 'r2'])

    removeFromOutbox('r1')
    expect(readOutbox().map((response) => response.id)).toEqual(['r2'])
    removeFromOutbox('missing')
    expect(readOutbox()).toHaveLength(1)
  })

  it('holds one copy when the same interview is submitted again', () => {
    queueResponse(pending('r1', { q1: 'first try' }))
    queueResponse(pending('r1', { q1: 'second try' }))
    expect(readOutbox()).toEqual([pending('r1', { q1: 'second try' })])
  })

  it('reports a response it could not store, and survives unreadable storage', () => {
    window.localStorage.setItem('forme:outbox', '{not json')
    expect(readOutbox()).toEqual([])
    window.localStorage.setItem('forme:outbox', '"a string"')
    expect(readOutbox()).toEqual([])

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(queueResponse(pending('r3'))).toBe(false)
  })
})
