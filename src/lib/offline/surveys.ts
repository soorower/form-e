import { lowestFreeInRange } from '../../../convex/serials'
import { decodeQuestionnaire } from '#/lib/convex/questionnaire-codec'
import { pictureUrls } from '#/lib/questionnaire/pictures'
import type { PendingResponse } from '#/lib/questionnaire/outbox'
import type { Questionnaire } from '#/lib/questionnaire/types'
import { getAll, getOne, putOne } from './db'

/**
 * Surveys kept on the tablet so they open with no connection: the survey
 * itself (as the server sends it), the surveyor's block of survey numbers
 * with the numbers in it already taken (`kit`), and the card counts a
 * choice block falls back on. The fill page saves all of it every time it
 * loads online, and "Make available offline" saves it without opening the
 * survey. Pictures and the page itself go into the service worker's caches
 * (`PICTURE_CACHE`, `PAGE_CACHE`; see sw/sw.js).
 */

/** Cache names shared with the service worker (sw/sw.js). */
export const PICTURE_CACHE = 'forme-pictures'
export const PAGE_CACHE = 'forme-pages'

/** A surveyor's block of numbers on one survey, and the numbers in it already used. */
export interface OfflineKit {
  start: number
  end: number
  taken: number[]
}

/** `responses.cardExposure` as last seen. */
export interface OfflineExposure {
  cards: { questionId: string; set: number; count: number; reserved: number }[]
  planRows: { questionId: string; row: number; count: number; reserved: number }[]
}

export interface OfflineSurvey {
  /** The questionnaire's id. */
  id: string
  /** The row `questionnaires.get` returned, still encoded (see questionnaire-codec). */
  stored: unknown
  savedAt: number
  /** Whose block `kit` is: the signed-in account's users id, or null signed out. */
  kitOwner?: string | null
  kit?: OfflineKit | null
  exposure?: OfflineExposure
  /** Pictures that could not be saved last time (none = all are on the tablet). */
  missingPictures?: number
}

export function readOfflineSurvey(id: string): Promise<OfflineSurvey | null> {
  return getOne<OfflineSurvey>('surveys', id)
}

export function listOfflineSurveys(): Promise<OfflineSurvey[]> {
  return getAll<OfflineSurvey>('surveys')
}

// Saves to one survey run one after another: each reads what is there and
// merges into it, and two at once would each drop the other's part.
const saving = new Map<string, Promise<unknown>>()

function serially<T>(id: string, work: () => Promise<T>): Promise<T> {
  const next = (saving.get(id) ?? Promise.resolve()).then(work, work)
  saving.set(id, next)
  return next
}

/** Merges `patch` into what is saved for the survey. */
export function saveOfflineSurvey(
  id: string,
  patch: Partial<Omit<OfflineSurvey, 'id'>>,
): Promise<boolean> {
  return serially(id, async () => {
    const current = await readOfflineSurvey(id)
    if (!current && patch.stored === undefined) return false
    const next: OfflineSurvey = {
      ...(current ?? { id, stored: patch.stored, savedAt: Date.now() }),
      ...patch,
      id,
    }
    return putOne('surveys', next)
  })
}

export function decodeOfflineSurvey(saved: OfflineSurvey | null): Questionnaire | null {
  return saved ? (decodeQuestionnaire(saved.stored) ?? null) : null
}

/** Every picture the survey may show, as URLs to fetch and keep. */
export function surveyPictureUrls(questionnaire: Questionnaire): string[] {
  const urls = new Set<string>()
  for (const question of questionnaire.questions) {
    if (question.type !== 'choice_experiment') continue
    for (const url of pictureUrls(question)) urls.add(url)
  }
  if (questionnaire.logo && /^https?:/.test(questionnaire.logo)) urls.add(questionnaire.logo)
  return [...urls].filter((url) => /^https?:/.test(url))
}

function hasCaches(): boolean {
  return typeof caches !== 'undefined'
}

/**
 * Fetches each picture into the picture cache, which the service worker
 * answers from when the tablet is offline. Returns how many could not be
 * fetched (0 = all are on the tablet).
 */
export async function cachePictures(urls: string[]): Promise<number> {
  if (!hasCaches() || urls.length === 0) return 0
  const cache = await caches.open(PICTURE_CACHE)
  let missing = 0
  await Promise.all(
    urls.map(async (url) => {
      if (await cache.match(url)) return
      try {
        const response = await fetch(url, { mode: 'cors' })
        if (!response.ok) throw new Error(String(response.status))
        await cache.put(url, response)
      } catch {
        try {
          // A server that sends no CORS headers still gives a picture an
          // <img> can show.
          const opaque = await fetch(url, { mode: 'no-cors' })
          await cache.put(url, opaque)
        } catch {
          missing += 1
        }
      }
    }),
  )
  return missing
}

/**
 * Keeps these pages of the app on the tablet, so each opens with no
 * connection even as the first page after a restart. Same-origin paths.
 */
export async function cachePages(paths: string[]): Promise<boolean> {
  if (!hasCaches()) return false
  try {
    const cache = await caches.open(PAGE_CACHE)
    await Promise.all(
      paths.map(async (path) => {
        const response = await fetch(path, { credentials: 'same-origin' })
        if (response.ok) await cache.put(path, response)
      }),
    )
    return true
  } catch {
    return false
  }
}

/**
 * The survey number an interview on this tablet gets without asking the
 * server: the lowest number in the surveyor's block not already recorded,
 * held, or used by a response still waiting on this tablet. Null without a
 * block, or once it is full.
 */
export function offlineSerial(
  kit: OfflineKit | null | undefined,
  surveyId: string,
  pending: PendingResponse[],
): number | null {
  if (!kit) return null
  const taken = new Set(kit.taken)
  for (const response of pending) {
    if (response.questionnaireId !== surveyId) continue
    if (response.claimedSerial !== undefined) taken.add(response.claimedSerial)
    if (response.paperSerial !== undefined) taken.add(response.paperSerial)
  }
  return lowestFreeInRange(taken, kit)
}

/**
 * The server recorded a response under `serial`: the saved block learns it
 * is taken, so the next offline interview does not pick it again.
 */
export function noteSerialTaken(surveyId: string, serial: number): Promise<void> {
  return serially(surveyId, async () => {
    const saved = await readOfflineSurvey(surveyId)
    if (!saved?.kit || saved.kit.taken.includes(serial)) return
    if (serial < saved.kit.start || serial > saved.kit.end) return
    await putOne('surveys', {
      ...saved,
      kit: { ...saved.kit, taken: [...saved.kit.taken, serial].sort((a, b) => a - b) },
    })
  })
}
