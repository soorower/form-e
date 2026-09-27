import { useEffect, useState } from 'react'
import { Check, HardDriveDownload, Loader2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { useMakeOffline } from '#/hooks/useOfflineSurvey'
import { readOfflineSurvey } from '#/lib/offline/surveys'

function formatWhen(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * "Make available offline" on a survey card: saves the survey, its
 * pictures, the surveyor's block of numbers and the pages it needs on this
 * tablet, then says when it was saved. Press it again before going out to
 * bring the saved copy up to date.
 */
export function MakeOfflineButton({
  surveyId,
  viewerId,
}: {
  surveyId: string
  viewerId: string | null
}) {
  const makeOffline = useMakeOffline(viewerId)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle')
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void readOfflineSurvey(surveyId).then((saved) => {
      if (!cancelled) setSavedAt(saved?.savedAt ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [surveyId])

  async function save() {
    setState('working')
    setNote(null)
    try {
      const { missingPictures } = await makeOffline(surveyId)
      setSavedAt(Date.now())
      setState('idle')
      if (missingPictures > 0) {
        setNote(
          `${missingPictures} picture${missingPictures === 1 ? '' : 's'} could not be saved; try again with a better connection.`,
        )
      }
    } catch (error) {
      setState('error')
      setNote(error instanceof Error ? error.message : 'Could not save it. Try again with internet.')
    }
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1">
      <Button type="button" variant="outline" size="sm" disabled={state === 'working'} onClick={save}>
        {state === 'working' ? (
          <Loader2 data-icon="inline-start" className="animate-spin" />
        ) : (
          <HardDriveDownload data-icon="inline-start" />
        )}
        {state === 'working'
          ? 'Saving on this tablet…'
          : savedAt
            ? 'Update offline copy'
            : 'Make available offline'}
      </Button>
      {savedAt !== null && state !== 'working' && (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
          <Check className="size-3.5" aria-hidden="true" />
          Works offline · saved {formatWhen(savedAt)}
        </span>
      )}
      {note && (
        <span className={`text-xs ${state === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
          {note}
        </span>
      )}
    </div>
  )
}
