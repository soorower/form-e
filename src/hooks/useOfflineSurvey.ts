import { useCallback, useEffect, useState } from 'react'
import { useConvex } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useSurveyPaths } from '#/components/auth/area'
import { decodeQuestionnaire } from '#/lib/convex/questionnaire-codec'
import { requestPersistentStorage } from '#/lib/offline/db'
import { onOutboxChange } from '#/lib/questionnaire/outbox'
import type { Questionnaire } from '#/lib/questionnaire/types'
import {
  cachePages,
  cachePictures,
  decodeOfflineSurvey,
  listOfflineSurveys,
  readOfflineSurvey,
  saveOfflineSurvey,
  surveyPictureUrls,
  type OfflineExposure,
  type OfflineKit,
  type OfflineSurvey,
} from '#/lib/offline/surveys'

/**
 * How long the fill page waits for the server's copy of the survey before it
 * opens the one saved on the tablet (at once when the tablet knows it is
 * offline). On a weak hotspot the server's copy may take a while or never come.
 */
export const LIVE_GRACE_MS = 5_000

/**
 * The fill page's survey, from the server when it answers and from the
 * tablet's saved copy when it does not. Every copy the server sends is saved
 * on the tablet (with its pictures), as are the surveyor's block of numbers
 * and the card counts, so the next visit opens without a connection.
 */
export function useOfflineSurvey({
  surveyId,
  liveStored,
  liveKit,
  kitOwner,
  liveExposure,
}: {
  surveyId: string
  /** `questionnaires.get`: undefined while loading, null when there is no such survey. */
  liveStored: unknown
  liveKit: OfflineKit | null | undefined
  /** Whose block `liveKit` is: the signed-in account's users id, or null. */
  kitOwner: string | null
  liveExposure: OfflineExposure | undefined
}) {
  const [saved, setSaved] = useState<OfflineSurvey | null | undefined>(undefined)
  const [waited, setWaited] = useState(false)
  const liveMissing = liveStored === undefined

  useEffect(() => {
    let cancelled = false
    setSaved(undefined)
    const read = () =>
      void readOfflineSurvey(surveyId).then((copy) => {
        if (!cancelled) setSaved(copy)
      })
    read()
    // A response reaching the server marks its number taken in the saved
    // block just before it leaves the outbox; read that in with it.
    const unsubscribe = onOutboxChange(read)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [surveyId])

  useEffect(() => {
    if (!liveMissing) {
      setWaited(false)
      return
    }
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    const timer = setTimeout(() => setWaited(true), offline ? 0 : LIVE_GRACE_MS)
    return () => clearTimeout(timer)
  }, [liveMissing])

  // The server's copy, and its pictures, onto the tablet.
  useEffect(() => {
    if (liveStored === undefined || liveStored === null) return
    let cancelled = false
    void (async () => {
      await saveOfflineSurvey(surveyId, { stored: liveStored, savedAt: Date.now() })
      const questionnaire = decodeQuestionnaire(liveStored)
      const missing = questionnaire ? await cachePictures(surveyPictureUrls(questionnaire)) : 0
      await saveOfflineSurvey(surveyId, { missingPictures: missing })
      const copy = await readOfflineSurvey(surveyId)
      if (!cancelled) setSaved(copy)
      void requestPersistentStorage()
    })()
    return () => {
      cancelled = true
    }
  }, [surveyId, liveStored])

  // `liveStored` too: the first save of the survey may still be on its way.
  useEffect(() => {
    if (liveKit === undefined || !liveStored) return
    void saveOfflineSurvey(surveyId, { kit: liveKit, kitOwner })
  }, [surveyId, liveKit, kitOwner, liveStored])

  useEffect(() => {
    if (!liveExposure || !liveStored) return
    void saveOfflineSurvey(surveyId, { exposure: liveExposure })
  }, [surveyId, liveExposure, liveStored])

  const fromDevice = liveMissing && waited
  return {
    /** What to render: the server's copy, else (after the wait) the saved one; null = none. */
    stored: !liveMissing ? liveStored : fromDevice && saved !== undefined ? (saved?.stored ?? null) : undefined,
    /** Showing the copy saved on this tablet because the server has not answered. */
    fromDevice: fromDevice && !!saved,
    /** The server has not answered and the tablet has no copy of this survey. */
    notOnDevice: fromDevice && saved === null,
    saved: saved ?? null,
    /** The saved block of numbers, if it is the signed-in account's. */
    savedKit: saved && (saved.kitOwner ?? null) === kitOwner ? saved.kit : undefined,
    savedExposure: saved?.exposure,
  }
}

/**
 * The surveys saved on this tablet, for a list page whose server answer has
 * not come (`waiting`): after `LIVE_GRACE_MS`, or at once when offline.
 * Undefined until then.
 */
export function useSavedSurveys(waiting: boolean): Questionnaire[] | undefined {
  const [saved, setSaved] = useState<Questionnaire[] | undefined>(undefined)
  useEffect(() => {
    if (!waiting) {
      setSaved(undefined)
      return
    }
    let cancelled = false
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    const timer = setTimeout(
      () =>
        void listOfflineSurveys().then((copies) => {
          if (cancelled) return
          setSaved(
            copies
              .map(decodeOfflineSurvey)
              .filter((questionnaire): questionnaire is Questionnaire => questionnaire !== null),
          )
        }),
      offline ? 0 : LIVE_GRACE_MS,
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [waiting])
  return saved
}

/** A promise that gives up after `ms` (Convex waits for ever while offline). */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('No connection to the server. Try again with internet.')), ms),
    ),
  ])
}

const MAKE_OFFLINE_TIMEOUT_MS = 20_000

/**
 * "Make available offline": saves a survey on the tablet without opening
 * it — the survey, its pictures, the surveyor's block of numbers, the card
 * counts, and the pages needed to open it — so it opens in the field with no
 * connection, even as the first thing after a restart.
 */
export function useMakeOffline(viewerId: string | null) {
  const client = useConvex()
  const paths = useSurveyPaths()
  return useCallback(
    async (surveyId: string): Promise<{ missingPictures: number }> => {
      const stored = await withTimeout(
        client.query(api.questionnaires.get, { id: surveyId }),
        MAKE_OFFLINE_TIMEOUT_MS,
      )
      if (!stored) throw new Error('This survey no longer exists.')
      const [kit, exposure] = await withTimeout(
        Promise.all([
          client.query(api.responses.offlineKit, { questionnaireId: surveyId }),
          client.query(api.responses.cardExposure, { questionnaireId: surveyId }),
        ]),
        MAKE_OFFLINE_TIMEOUT_MS,
      )
      await saveOfflineSurvey(surveyId, {
        stored,
        savedAt: Date.now(),
        kit,
        kitOwner: viewerId,
        exposure,
      })
      const questionnaire = decodeQuestionnaire(stored)
      const missingPictures = questionnaire ? await cachePictures(surveyPictureUrls(questionnaire)) : 0
      await saveOfflineSurvey(surveyId, { missingPictures })
      await cachePages([paths.list, paths.fill.replace('$surveyId', surveyId)])
      await requestPersistentStorage()
      return { missingPictures }
    },
    [client, paths, viewerId],
  )
}
