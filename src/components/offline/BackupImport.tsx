import { useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { FileUp, Loader2 } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { Button } from '#/components/ui/button'
import { useConfirm } from '#/components/ConfirmProvider'
import { encodeAnswers } from '#/lib/convex/response-codec'
import { readBackupFile } from '#/lib/offline/backup'

/** Responses sent per request: keeps each well inside Convex's per-mutation limits. */
const BATCH = 20

/**
 * "Import tablet backup": a builder takes in the file a tablet saved with
 * "Download unsent responses" (.json or .xlsx). Each response is recorded
 * once (one the tablet did get through is left alone), under the number it
 * was done under when that is still free, credited to its surveyor.
 */
export function BackupImport() {
  const confirm = useConfirm()
  const importBackup = useMutation(api.responses.importBackup)
  const input = useRef<HTMLInputElement>(null)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  async function pick(file: File) {
    setMessage(null)
    let responses
    try {
      responses = await readBackupFile(file)
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'The file could not be read.' })
      return
    }
    if (responses.length === 0) {
      setMessage({ tone: 'error', text: 'This backup holds no responses.' })
      return
    }
    const sure = await confirm({
      title: `Import ${responses.length} ${responses.length === 1 ? 'response' : 'responses'}?`,
      description:
        'They are recorded on the server now. Any the tablet already sent are skipped, so nothing is counted twice.',
      confirmLabel: 'Import',
    })
    if (!sure) return
    setWorking(true)
    let added = 0
    let already = 0
    const skipped: string[] = []
    try {
      for (let start = 0; start < responses.length; start += BATCH) {
        const results = await importBackup({
          responses: responses.slice(start, start + BATCH).map((response) => ({
            id: response.id,
            questionnaireId: response.questionnaireId,
            enumerator: response.enumerator,
            language: response.language,
            ...(response.respondent ? { respondent: response.respondent } : {}),
            answers: encodeAnswers(response.answers),
            collectedAt: response.queuedAt,
            ...(response.claimedSerial !== undefined ? { claimedSerial: response.claimedSerial } : {}),
            ...(response.paperSerial !== undefined ? { paperSerial: response.paperSerial } : {}),
            ...(response.surveyorId ? { surveyorId: response.surveyorId } : {}),
          })),
        })
        for (const result of results) {
          if (result.status === 'added') added += 1
          else if (result.status === 'already') already += 1
          else skipped.push(result.reason ?? 'skipped')
        }
      }
      const parts = [`${added} added`]
      if (already > 0) parts.push(`${already} already on the server`)
      if (skipped.length > 0) parts.push(`${skipped.length} skipped (${[...new Set(skipped)].join(' ')})`)
      setMessage({ tone: skipped.length > 0 ? 'error' : 'ok', text: `Imported: ${parts.join(', ')}.` })
    } catch (error) {
      setMessage({
        tone: 'error',
        text: `The import stopped after ${added} responses: ${
          error instanceof Error ? error.message : 'the server did not answer'
        }. Importing the same file again is safe.`,
      })
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={input}
        type="file"
        accept=".json,.xlsx,application/json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void pick(file)
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={working} onClick={() => input.current?.click()}>
        {working ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <FileUp data-icon="inline-start" />}
        {working ? 'Importing…' : 'Import tablet backup'}
      </Button>
      {message && (
        <span className={`text-sm ${message.tone === 'error' ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'}`}>
          {message.text}
        </span>
      )}
    </div>
  )
}
