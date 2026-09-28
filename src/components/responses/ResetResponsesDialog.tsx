import { useState } from 'react'
import { useMutation } from 'convex/react'
import { ConvexError } from 'convex/values'
import { Check, Download, FileJson, FileSpreadsheet, TriangleAlert, Trash2 } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'

/** What has to be typed before the delete button works. */
export const RESET_WORD = 'RESET'

type Format = 'xlsx' | 'csv' | 'json'

interface ResetResponsesDialogProps {
  questionnaireId: string
  surveyTitle: string
  /** Every response of the survey, whatever enumerator the panel is narrowed to. */
  count: number
  /** Downloads every response in that format, like the panel's own buttons. */
  download: (format: Format) => void | Promise<void>
}

function errorText(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === 'string') return error.data
  return error instanceof Error ? error.message : 'Something went wrong.'
}

/**
 * The admin's "Reset responses": deletes every response the survey has
 * collected, to start the real survey after testing. It warns first, offers
 * a copy of everything in Excel, CSV and JSON before anything goes, and only
 * deletes once RESET_WORD is typed. The server deletes in batches
 * (`responses.resetSurvey`), so a large survey is called for until done.
 */
export function ResetResponsesDialog({
  questionnaireId,
  surveyTitle,
  count,
  download,
}: ResetResponsesDialogProps) {
  const reset = useMutation(api.responses.resetSurvey)
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [saved, setSaved] = useState<Set<Format>>(new Set())
  const [preparing, setPreparing] = useState<Format | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleted, setDeleted] = useState(0)
  const [error, setError] = useState<string | null>(null)

  function openChange(next: boolean) {
    // Closing mid-delete would hide how far it got; it finishes first.
    if (deleting) return
    setOpen(next)
    if (next) {
      setTyped('')
      setSaved(new Set())
      setDeleted(0)
      setError(null)
    }
  }

  async function save(format: Format) {
    setPreparing(format)
    setError(null)
    try {
      await download(format)
      setSaved((done) => new Set(done).add(format))
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setPreparing(null)
    }
  }

  async function confirmReset() {
    setDeleting(true)
    setError(null)
    let total = 0
    try {
      for (;;) {
        const { deleted: batch, done } = await reset({ questionnaireId })
        total += batch
        setDeleted(total)
        if (done) break
      }
      setDeleting(false)
      setOpen(false)
    } catch (caught) {
      setDeleting(false)
      setError(
        `${errorText(caught)}${total > 0 ? ` ${total} of ${count} responses were already deleted.` : ''}`,
      )
    }
  }

  const ready = typed.trim().toUpperCase() === RESET_WORD
  const plural = count === 1 ? 'response' : 'responses'

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">Reset responses</p>
          <p className="text-xs text-muted-foreground">
            Delete all {count} {plural} to start the real survey. Survey numbers start again.
          </p>
        </div>
        <Button type="button" variant="destructive" size="sm" onClick={() => openChange(true)}>
          <Trash2 data-icon="inline-start" />
          Reset responses
        </Button>
      </div>

      <Dialog open={open} onOpenChange={openChange}>
        <DialogContent showCloseButton={!deleting} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="size-5 text-destructive" aria-hidden="true" />
              Delete all {count} {plural}?
            </DialogTitle>
            <DialogDescription>
              Every response collected for <span className="font-medium text-foreground">{surveyTitle}</span>{' '}
              is deleted for good, for every enumerator, and survey numbers start again from the
              beginning. This cannot be undone. The survey, its questions, team, number blocks and
              links stay.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">1. Download a copy first</p>
            <p className="text-xs text-muted-foreground">
              All {count} {plural}, whatever enumerator is picked on the page.
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['xlsx', 'Excel', FileSpreadsheet],
                  ['csv', 'CSV', Download],
                  ['json', 'JSON', FileJson],
                ] as const
              ).map(([format, label, Icon]) => (
                <Button
                  key={format}
                  type="button"
                  size="sm"
                  variant={format === 'xlsx' ? 'default' : 'outline'}
                  disabled={preparing !== null || deleting}
                  onClick={() => void save(format)}
                >
                  {saved.has(format) ? <Check data-icon="inline-start" /> : <Icon data-icon="inline-start" />}
                  {preparing === format ? 'Preparing…' : `Download ${label}`}
                </Button>
              ))}
            </div>
            {saved.size === 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                No copy downloaded yet. Once deleted, these responses are gone.
              </p>
            )}
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <Label htmlFor="reset-confirm" className="text-sm font-medium">
              2. Type {RESET_WORD} to confirm
            </Label>
            <Input
              id="reset-confirm"
              value={typed}
              autoComplete="off"
              disabled={deleting}
              placeholder={RESET_WORD}
              onChange={(event) => setTyped(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              A tablet that still has test responses waiting to upload will send them when it is
              next online; clear those on the tablet first.
            </p>
          </div>

          {deleting && (
            <p role="status" className="text-sm text-muted-foreground">
              Deleting… {deleted} of {count}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={deleting} onClick={() => openChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!ready || deleting}
              onClick={() => void confirmReset()}
            >
              <Trash2 data-icon="inline-start" />
              {deleting ? 'Deleting…' : `Delete all ${count} ${plural}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
