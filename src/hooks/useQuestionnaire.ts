import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useConvexReady } from '#/lib/convex/hooks'
import { decodeQuestionnaire, encodeQuestionnaire } from '#/lib/convex/questionnaire-codec'
import type { Questionnaire } from '#/lib/questionnaire/types'

type Updater = (current: Questionnaire) => Questionnaire

const AUTOSAVE_DELAY_MS = 400

/**
 * Loads one questionnaire from Convex and autosaves edits after a short pause.
 * `questionnaire` is undefined while loading and null when not found.
 *
 * While the author is typing, the local draft wins: server updates are only
 * adopted once the draft has been saved, so a slow round trip cannot overwrite
 * a keystroke. Edits from another device appear as soon as typing settles.
 */
export function useQuestionnaire(id: string) {
  const ready = useConvexReady()
  const remote = useQuery(api.questionnaires.get, ready ? { id } : 'skip')
  const save = useMutation(api.questionnaires.save)

  const [draft, setDraft] = useState<Questionnaire | null | undefined>(undefined)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const dirty = useRef(false)
  const latest = useRef<Questionnaire | null>(null)

  // Adopt server state unless there are unsaved local edits.
  useEffect(() => {
    if (remote === undefined) return
    if (dirty.current) return
    const next = decodeQuestionnaire(remote)
    setDraft(next ?? null)
    setSavedAt(next?.updatedAt ?? null)
  }, [remote])

  useEffect(() => {
    dirty.current = false
    setDraft(undefined)
  }, [id])

  useEffect(() => {
    latest.current = draft ?? null
  }, [draft])

  const update = useCallback((updater: Updater) => {
    dirty.current = true
    setDraft((current) => (current ? updater(current) : current))
  }, [])

  useEffect(() => {
    if (!draft || !dirty.current) return
    const timer = setTimeout(() => {
      const pending = draft
      void save(encodeQuestionnaire(pending) as never).then(() => {
        // Another edit may have landed while the mutation was in flight.
        if (latest.current === pending) dirty.current = false
        setSavedAt(Date.now())
      })
    }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [draft, save])

  // Flush a pending edit if the user navigates away before the timer fires.
  useEffect(
    () => () => {
      if (dirty.current && latest.current) void save(encodeQuestionnaire(latest.current) as never)
    },
    [save],
  )

  return { questionnaire: draft, update, savedAt }
}
