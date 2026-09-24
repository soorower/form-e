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
  /**
   * The server's reason for turning it down. Such a copy is kept, so nothing
   * is lost, but not sent again by itself: the same payload would only be
   * refused again, and a survey that was deleted is not coming back.
   */
  refused?: string
}

/** What the fill page throws when the server refused a response, with its reason. */
export class RefusedResponseError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'RefusedResponseError'
  }
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

/** The server said no: the copy stays, with the reason, out of the automatic retries. */
export function markRefused(id: string, reason: string) {
  const pending = readOutbox()
  if (!pending.some((response) => response.id === id)) return
  writeOutbox(
    pending.map((response) => (response.id === id ? { ...response, refused: reason } : response)),
  )
}

/** Puts every refused response back in line, for a deliberate "try again". */
export function clearRefused() {
  const pending = readOutbox()
  if (pending.some((response) => response.refused !== undefined)) {
    writeOutbox(pending.map(({ refused: _reason, ...response }) => response))
  }
}

const OPEN_INTERVIEW_KEY = 'forme:openInterview'

/**
 * The interview whose cards this device holds right now. Giving them back on
 * `pagehide` is best effort (it needs an open socket, and a discarded tab
 * fires no such event), so the next fill page opened here hands back
 * whatever the last one was still holding.
 */
export function rememberOpenInterview(id: string) {
  if (!canStore()) return
  try {
    window.localStorage.setItem(OPEN_INTERVIEW_KEY, id)
  } catch {
    // Nothing to do: the reservation then simply expires on its own.
  }
}

export function recallOpenInterview(): string | null {
  if (!canStore()) return null
  try {
    return window.localStorage.getItem(OPEN_INTERVIEW_KEY)
  } catch {
    return null
  }
}

export function forgetOpenInterview(id: string) {
  if (recallOpenInterview() === id) {
    try {
      window.localStorage.removeItem(OPEN_INTERVIEW_KEY)
    } catch {
      // Ignore: an id left behind is handed back harmlessly next time.
    }
  }
}

export function removeFromOutbox(id: string) {
  const pending = readOutbox()
  if (pending.some((response) => response.id === id)) {
    writeOutbox(pending.filter((response) => response.id !== id))
  }
}
