import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { api } from '../../convex/_generated/api'
import { useConvexReady } from '#/lib/convex/hooks'
import { decodeQuestionnaire, encodeQuestionnaire } from '#/lib/convex/questionnaire-codec'
import { mergeEdits, sameValue } from '#/lib/questionnaire/merge'
import type { Questionnaire } from '#/lib/questionnaire/types'

type Updater = (current: Questionnaire) => Questionnaire

const AUTOSAVE_DELAY_MS = 400
/** A failed save is tried again after this, as long as the draft is still unsaved. */
const RETRY_DELAY_MS = 15_000
/**
 * Convex stores a document of at most 1 MiB. Checked before sending, with
 * room for the encoding, so the creator hears which survey is too big
 * instead of a bare "could not save" on every keystroke from then on.
 */
const MAX_DOCUMENT_BYTES = 900_000

/** An unsaved draft kept on this device, in case the page goes before it is saved. */
export interface DraftBackup {
  questionnaire: Questionnaire
  savedAt: number
}

function backupKey(id: string): string {
  return `forme:draft:${id}`
}

function readBackup(id: string): DraftBackup | null {
  try {
    const raw = window.localStorage.getItem(backupKey(id))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DraftBackup>
    return parsed.questionnaire && typeof parsed.savedAt === 'number'
      ? (parsed as DraftBackup)
      : null
  } catch {
    return null
  }
}

function writeBackup(id: string, questionnaire: Questionnaire) {
  try {
    const backup: DraftBackup = { questionnaire, savedAt: Date.now() }
    window.localStorage.setItem(backupKey(id), JSON.stringify(backup))
  } catch {
    // Storage full or blocked: the draft only lives in memory, as before.
  }
}

function clearBackup(id: string) {
  try {
    window.localStorage.removeItem(backupKey(id))
  } catch {
    // Nothing to clear.
  }
}

/** The current row the server sent back with a "changed elsewhere" refusal. */
function conflictRow(error: unknown): Questionnaire | null {
  if (!(error instanceof ConvexError)) return null
  const data = error.data as { code?: unknown; current?: unknown } | null
  if (!data || typeof data !== 'object' || data.code !== 'changed-elsewhere') return null
  return decodeQuestionnaire(data.current) ?? null
}

function saveErrorText(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === 'string') return error.data
  // In development the real message helps; in production it is redacted anyway.
  if (import.meta.env.DEV && error instanceof Error && error.message) {
    return `Could not save the last change: ${error.message}`
  }
  return 'Could not save the last change. It is kept on this device and tried again shortly.'
}

/**
 * Loads one questionnaire for editing and autosaves edits after a short
 * pause. `questionnaire` is undefined while loading and null when not found
 * or not accessible to this account (the query only returns surveys the
 * caller may edit, so the editor never opens on a survey it cannot save).
 *
 * While the author is typing, the local draft wins: server updates are only
 * adopted once the draft has been saved, so a slow round trip cannot overwrite
 * a keystroke. A save is sent with the `updatedAt` it started from; when the
 * row changed underneath (the admin's target, the dashboard's team editor,
 * another tab), the server refuses and the edits are merged onto the newer
 * copy field by field and saved again, so neither side's change is lost.
 *
 * `dirty` says there are edits the server has not confirmed; the page shows
 * it and the browser asks before unloading. The draft is also kept on this
 * device until it is saved, and offered back (`backup`) if the page comes
 * back with it still unsaved.
 */
export function useQuestionnaire(id: string) {
  const ready = useConvexReady()
  const remote = useQuery(api.questionnaires.getEditable, ready ? { id } : 'skip')
  const save = useMutation(api.questionnaires.save)

  const [draft, setDraft] = useState<Questionnaire | null | undefined>(undefined)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [backup, setBackup] = useState<DraftBackup | null>(null)
  // How many failed saves have been retried; bumping it re-runs the save.
  const [retries, setRetries] = useState(0)
  const dirtyRef = useRef(false)
  const latest = useRef<Questionnaire | null>(null)
  // The server copy the draft was taken from: what a merge compares against.
  const base = useRef<Questionnaire | null>(null)

  const markDirty = useCallback((value: boolean) => {
    dirtyRef.current = value
    setDirty(value)
  }, [])

  // Adopt server state unless there are unsaved local edits.
  useEffect(() => {
    if (remote === undefined) return
    const next = decodeQuestionnaire(remote)
    if (dirtyRef.current) return
    base.current = next ?? null
    setDraft(next ?? null)
    setSavedAt(next?.updatedAt ?? null)
    // A draft left on this device by an earlier visit, still unsaved.
    if (next) {
      const kept = readBackup(id)
      if (kept && kept.savedAt > next.updatedAt && !sameValue(kept.questionnaire, next)) {
        setBackup(kept)
      } else if (kept) {
        clearBackup(id)
      }
    }
  }, [remote, id])

  // Leaving for another survey: whatever is pending goes first.
  useEffect(() => {
    return () => {
      if (dirtyRef.current && latest.current) {
        save({
          ...encodeQuestionnaire(latest.current),
          baseUpdatedAt: base.current?.updatedAt,
        } as never).catch(() => undefined)
      }
      dirtyRef.current = false
      latest.current = null
      base.current = null
    }
  }, [id, save])

  useEffect(() => {
    markDirty(false)
    setDraft(undefined)
    setBackup(null)
    setSaveError(null)
  }, [id, markDirty])

  useEffect(() => {
    latest.current = draft ?? null
  }, [draft])

  const update = useCallback(
    (updater: Updater) => {
      markDirty(true)
      setDraft((current) => (current ? updater(current) : current))
    },
    [markDirty],
  )

  useEffect(() => {
    if (!draft || !dirtyRef.current) return
    writeBackup(id, draft)
    const timer = setTimeout(() => {
      const pending = draft
      const encoded = encodeQuestionnaire(pending)
      const bytes = JSON.stringify(encoded).length
      if (bytes > MAX_DOCUMENT_BYTES) {
        setSaveError(
          `This survey is too large to save (${Math.round(bytes / 1024)} KB of about ${Math.round(MAX_DOCUMENT_BYTES / 1024)} KB): use a smaller logo, or move some choice blocks to another survey. The edits are kept on this device meanwhile.`,
        )
        return
      }
      save({ ...encoded, baseUpdatedAt: base.current?.updatedAt } as never)
        .then((stored) => {
          base.current = decodeQuestionnaire(stored) ?? base.current
          // Another edit may have landed while the mutation was in flight.
          if (latest.current === pending) {
            markDirty(false)
            clearBackup(id)
          }
          setSavedAt(Date.now())
          setSaveError(null)
        })
        .catch((error: unknown) => {
          const current = conflictRow(error)
          if (current && latest.current) {
            // Someone else's change arrived first: keep it, keep ours, save again.
            const merged = mergeEdits(base.current, latest.current, current)
            base.current = current
            setDraft(merged)
            setSaveError(null)
            return
          }
          setSaveError(saveErrorText(error))
          setTimeout(() => setRetries((count) => count + 1), RETRY_DELAY_MS)
        })
    }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [draft, save, id, markDirty, retries])

  // Flush a pending edit if the page is left before the timer fires.
  useEffect(
    () => () => {
      if (dirtyRef.current && latest.current) {
        save({
          ...encodeQuestionnaire(latest.current),
          baseUpdatedAt: base.current?.updatedAt,
        } as never).catch(() => undefined)
      }
    },
    [save],
  )

  // The browser's own "leave anyway?" while edits are unsaved.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const restoreBackup = useCallback(() => {
    if (!backup) return
    setBackup(null)
    markDirty(true)
    setDraft(backup.questionnaire)
  }, [backup, markDirty])

  const discardBackup = useCallback(() => {
    clearBackup(id)
    setBackup(null)
  }, [id])

  return { questionnaire: draft, update, savedAt, saveError, dirty, backup, restoreBackup, discardBackup }
}
