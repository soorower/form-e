import { useState } from 'react'
import { Download, FileSpreadsheet, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { useConfirm } from '#/components/ConfirmProvider'
import { backupFileName, backupJson, backupWorkbook } from '#/lib/offline/backup'
import { decodeOfflineSurvey, listOfflineSurveys } from '#/lib/offline/surveys'
import { downloadBlob, downloadText } from '#/lib/questionnaire/export'
import { removeFromOutbox, type PendingResponse } from '#/lib/questionnaire/outbox'
import type { Questionnaire } from '#/lib/questionnaire/types'
import { RETRY_INTERVAL_MS, useOutbox } from './OutboxProvider'

/**
 * What is kept on this device and not on the server yet: a count with
 * "Send now", the connection's state, and "Download unsent responses" (JSON
 * and Excel) as the last resort when the tablet cannot sync for days. Below
 * it, any the server turned down, each with its reason, "Try again" and
 * "Discard". Renders nothing when the outbox is empty.
 */
export function UnsentPanel({ className = '' }: { className?: string }) {
  const confirm = useConfirm()
  const { pending, waiting, refused, connected, flush, retryRefused } = useOutbox()
  const [saving, setSaving] = useState<'json' | 'xlsx' | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  if (waiting === 0 && refused.length === 0) return null

  async function download(kind: 'json' | 'xlsx') {
    setSaving(kind)
    setProblem(null)
    try {
      if (kind === 'json') {
        downloadText(backupFileName('json'), backupJson(pending), 'application/json')
      } else {
        const surveys = new Map<string, Questionnaire>()
        for (const saved of await listOfflineSurveys()) {
          const questionnaire = decodeOfflineSurvey(saved)
          if (questionnaire) surveys.set(saved.id, questionnaire)
        }
        const buffer = await backupWorkbook(pending, surveys)
        downloadBlob(
          backupFileName('xlsx'),
          new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
        )
      }
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'The file could not be made.')
    } finally {
      setSaving(null)
    }
  }

  async function discard(response: PendingResponse) {
    const sure = await confirm({
      title: 'Discard this response for good?',
      description: 'It is not on the server and cannot be recovered afterwards.',
      confirmLabel: 'Discard',
      destructive: true,
    })
    if (sure) await removeFromOutbox(response.id)
  }

  const downloads = (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={saving !== null}
        onClick={() => download('json')}
      >
        <Download data-icon="inline-start" />
        {saving === 'json' ? 'Saving…' : 'Download unsent (JSON)'}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={saving !== null}
        onClick={() => download('xlsx')}
      >
        <FileSpreadsheet data-icon="inline-start" />
        {saving === 'xlsx' ? 'Saving…' : 'Download unsent (Excel)'}
      </Button>
    </div>
  )

  return (
    <div className={`mx-auto w-full max-w-3xl space-y-4 ${className}`}>
      {waiting > 0 && (
        <div
          role="status"
          className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-800 dark:text-amber-300"
        >
          <p>
            {waiting === 1
              ? '1 response is kept on this device and is not on the server yet.'
              : `${waiting} responses are kept on this device and are not on the server yet.`}{' '}
            They are sent when the internet is back.
            <span lang="bn" className="block">
              {waiting} টি উত্তর এই ডিভাইসে রাখা আছে, এখনও সার্ভারে পৌঁছায়নি। ইন্টারনেট ফিরে এলে নিজে থেকেই পাঠানো হবে।
            </span>
          </p>
          {connected !== null && (
            <p className="flex items-center justify-center gap-1.5 text-xs">
              {connected ? (
                <>
                  <Wifi className="size-3.5" aria-hidden="true" /> Connected · sending…
                </>
              ) : (
                <>
                  <WifiOff className="size-3.5" aria-hidden="true" /> No connection to the server ·
                  trying again every {Math.round(RETRY_INTERVAL_MS / 1000)} s
                </>
              )}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={flush}>
              <RefreshCw data-icon="inline-start" />
              Send now
            </Button>
          </div>
          {downloads}
          <p className="text-xs opacity-80">
            Cannot get online for days? Download the unsent responses and send the file to your
            survey builder, who imports it from the Surveys page.
          </p>
        </div>
      )}
      {refused.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <p className="font-medium">
            {refused.length === 1
              ? 'The server did not accept 1 response kept on this device.'
              : `The server did not accept ${refused.length} responses kept on this device.`}{' '}
            They stay here until you try again or discard them.
          </p>
          <ul className="mt-2 space-y-1.5">
            {refused.map((response) => (
              <li key={response.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {new Date(response.queuedAt).toLocaleString()} · {response.enumerator || '(no name)'}
                  : {response.refused}
                </span>
                <Button type="button" variant="outline" size="sm" onClick={() => discard(response)}>
                  Discard
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={retryRefused}>
              Try again
            </Button>
            {waiting === 0 && downloads}
          </div>
        </div>
      )}
      {problem && <p className="text-center text-sm text-destructive">{problem}</p>}
    </div>
  )
}
