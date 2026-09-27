// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { putOne } from '#/lib/offline/db'
import { freshOfflineDb } from '#/lib/offline/testing'
import { queueResponse, readOutbox, type PendingResponse } from '#/lib/questionnaire/outbox'
import { OutboxProvider, RETRY_INTERVAL_MS } from './OutboxProvider'

const mocks = vi.hoisted(() => ({ submit: vi.fn() }))

vi.mock('convex/react', () => ({
  useMutation: () => mocks.submit,
  useConvex: () => null,
}))

function pending(id: string, extra: Partial<PendingResponse> = {}): PendingResponse {
  return { id, questionnaireId: 's1', enumerator: 'Ikra', language: 'en', answers: {}, queuedAt: 1, ...extra }
}

describe('OutboxProvider', () => {
  beforeEach(async () => {
    await freshOfflineDb()
    mocks.submit.mockReset()
    mocks.submit.mockResolvedValue({ serial: 1, surveyNumber: 'T-001' })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('sends what is waiting as soon as the app opens, whatever the page', async () => {
    await queueResponse(pending('r1', { claimedSerial: 103 }))
    render(<OutboxProvider area="app">page</OutboxProvider>)
    await waitFor(async () => expect(await readOutbox()).toEqual([]))
    expect(mocks.submit.mock.calls[0][0]).toMatchObject({ id: 'r1', claimedSerial: 103, collectedAt: 1 })
  })

  it('sends only what was collected under its own sign-in area', async () => {
    await queueResponse(pending('admin-one', { area: 'admin' }))
    render(<OutboxProvider area="app">page</OutboxProvider>)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(await readOutbox()).toHaveLength(1)
  })

  it(`tries again every ${RETRY_INTERVAL_MS / 1000} s, which a weak hotspot needs`, async () => {
    // Only the interval is faked; IndexedDB keeps its own timers.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    render(<OutboxProvider area="app">page</OutboxProvider>)
    await new Promise((resolve) => setTimeout(resolve, 20))
    // Kept without telling anyone, as another tab or an older page would.
    await putOne('outbox', pending('late'))
    expect(mocks.submit).not.toHaveBeenCalled()

    vi.advanceTimersByTime(RETRY_INTERVAL_MS)
    // waitFor polls on setInterval, which is faked here: poll by hand.
    for (let tries = 0; tries < 50 && mocks.submit.mock.calls.length === 0; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    expect(mocks.submit).toHaveBeenCalledTimes(1)
    expect(mocks.submit.mock.calls[0][0].id).toBe('late')
  })
})
