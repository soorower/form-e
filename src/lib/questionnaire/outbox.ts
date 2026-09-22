import type { AnswerValue, Lang, RespondentDetails } from './types'

/**
 * Responses waiting to reach the server. The fill page writes a response here
 * before sending it and removes it once the server confirms, so an interview
 * survives a tablet that loses its connection, reloads, or is closed while
 * "Saving…" is on screen. `responses.submit` ignores an id it already holds,
 * so sending the same response twice records it once.
 */

const OUTBOX_KEY = 'forme:outbox'

/** What `responses.submit` takes, plus when it was queued on this device. */
export interface PendingResponse {
  id: string
  questionnaireId: string
  enumerator: string
  language: Lang
  /** Only present when the survey asks the respondent for their own details. */
  respondent?: RespondentDetails
  answers: Record<string, AnswerValue>
  queuedAt: number
}

function canStore(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function readOutbox(): PendingResponse[] {
  if (!canStore()) return []
  try {
    const raw = window.localStorage.getItem(OUTBOX_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as PendingResponse[]) : []
  } catch {
    return []
  }
}

function writeOutbox(pending: PendingResponse[]): boolean {
  if (!canStore()) return false
  try {
    window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(pending))
    return true
  } catch {
    // Quota exceeded or storage disabled: the response only lives in memory.
    return false
  }
}

/** Keeps the response on this device. False when it could not be stored. */
export function queueResponse(response: PendingResponse): boolean {
  const others = readOutbox().filter((pending) => pending.id !== response.id)
  return writeOutbox([...others, response])
}

export function removeFromOutbox(id: string) {
  const pending = readOutbox()
  if (pending.some((response) => response.id === id)) {
    writeOutbox(pending.filter((response) => response.id !== id))
  }
}
