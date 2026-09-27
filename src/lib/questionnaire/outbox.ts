import { deleteOne, getAll, putMany, putOne } from '#/lib/offline/db'
import type { AnswerValue, Lang, RespondentDetails } from './types'

/**
 * Responses waiting to reach the server. The fill page writes a response here
 * before sending it and removes it once the server confirms, so an interview
 * survives a tablet that loses its connection, reloads, or is closed while
 * "Saving…" is on screen. `responses.submit` ignores an id it already holds,
 * so sending the same response twice records it once.
 *
 * Kept in the tablet's IndexedDB (`src/lib/offline/db.ts`), not localStorage:
 * more room, and not the first thing the browser clears when space is short.
 */

/** Where the outbox used to live; moved into IndexedDB the first time it is read. */
const LEGACY_OUTBOX_KEY = 'forme:outbox'

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
  /** A paper form being typed in: the survey number printed on it. */
  paperSerial?: number
  /** Answered through a share link: its token, which credits whoever shared it. */
  shareToken?: string
  /**
   * The number the interview was done under, from the surveyor's own block
   * (picked on the tablet when offline). The server keeps it while it is free.
   */
  claimedSerial?: number
  /** That number as shown ("ACBUS-007"), for lists and the backup file. */
  surveyNumber?: string
  /**
   * Which sign-in the response was collected under: the app's (default) or
   * the admin area's. Each area's session sends only its own, so a response
   * is stamped with the account that collected it.
   */
  area?: 'app' | 'admin'
  /** The users id of the signed-in collector, for a backup imported elsewhere. */
  surveyorId?: string
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

// ── change notifications ────────────────────────────────────────────────

const listeners = new Set<() => void>()
let channel: BroadcastChannel | null = null

function broadcastChannel(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === 'undefined') return channel
  channel = new BroadcastChannel('forme-outbox')
  // Another tab changed the outbox: tell this tab's listeners too.
  channel.onmessage = () => {
    for (const listener of listeners) listener()
  }
  return channel
}

function changed() {
  for (const listener of listeners) listener()
  try {
    broadcastChannel()?.postMessage('changed')
  } catch {
    // Other tabs then only see it on their next read.
  }
}

/** Calls `listener` whenever the outbox changes, in this tab or another. */
export function onOutboxChange(listener: () => void): () => void {
  broadcastChannel()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// ── reading and writing ─────────────────────────────────────────────────

let migrated: Promise<void> | null = null

/** Moves an outbox left in localStorage by an older version into IndexedDB. */
function migrateLegacy(): Promise<void> {
  migrated ??= (async () => {
    if (typeof window === 'undefined') return
    let legacy: PendingResponse[] = []
    try {
      const raw = window.localStorage.getItem(LEGACY_OUTBOX_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      legacy = Array.isArray(parsed) ? (parsed as PendingResponse[]) : []
    } catch {
      return
    }
    if (legacy.length === 0) return
    // The old copy is only removed once the new one is safely written.
    if (await putMany('outbox', legacy)) {
      try {
        window.localStorage.removeItem(LEGACY_OUTBOX_KEY)
      } catch {
        // Left behind, it is moved again next time; ids make that harmless.
      }
    }
  })()
  return migrated
}

/** Forgets that the move was done, so a test can set up legacy data again. */
export function resetOutboxMigration() {
  migrated = null
}

/** Everything waiting on this device, oldest first. */
export async function readOutbox(): Promise<PendingResponse[]> {
  await migrateLegacy()
  const pending = await getAll<PendingResponse>('outbox')
  return pending.sort((a, b) => a.queuedAt - b.queuedAt)
}

/** Keeps the response on this device. False when it could not be stored. */
export async function queueResponse(response: PendingResponse): Promise<boolean> {
  await migrateLegacy()
  const kept = await putOne('outbox', response)
  changed()
  return kept
}

/** The server said no: the copy stays, with the reason, out of the automatic retries. */
export async function markRefused(id: string, reason: string) {
  const pending = (await readOutbox()).find((response) => response.id === id)
  if (!pending) return
  await putOne('outbox', { ...pending, refused: reason })
  changed()
}

/** Puts every refused response back in line, for a deliberate "try again". */
export async function clearRefused() {
  const refused = (await readOutbox()).filter((response) => response.refused !== undefined)
  if (refused.length === 0) return
  await putMany(
    'outbox',
    refused.map(({ refused: _reason, ...response }) => response),
  )
  changed()
}

export async function removeFromOutbox(id: string) {
  await migrateLegacy()
  await deleteOne('outbox', id)
  changed()
}

// ── the interview whose cards this device holds ─────────────────────────

const OPEN_INTERVIEW_KEY = 'forme:openInterview'

function canStore(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

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
