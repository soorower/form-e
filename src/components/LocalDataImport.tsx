import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { CloudUpload, Check } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { Button } from '#/components/ui/button'
import { encodeQuestionnaire } from '#/lib/convex/questionnaire-codec'
import { encodeAnswers } from '#/lib/convex/response-codec'
import { listQuestionnaires, listResponses } from '#/lib/questionnaire/storage'
import type { Questionnaire, SurveyResponse } from '#/lib/questionnaire/types'

const DONE_KEY = 'forme:imported-to-convex'

interface LocalData {
  questionnaires: Questionnaire[]
  responses: SurveyResponse[]
}

function readLocalData(): LocalData {
  const questionnaires = listQuestionnaires()
  const responses = questionnaires.flatMap((questionnaire) => listResponses(questionnaire.id))
  return { questionnaires, responses }
}

/**
 * Surveys built before the Convex deployment existed live only in this
 * browser. This offers a one-time upload so the team can see them. The local
 * copy is left untouched as a backup.
 */
export function LocalDataImport() {
  const [local, setLocal] = useState<LocalData | null>(null)
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const saveQuestionnaire = useMutation(api.questionnaires.save)
  const importResponses = useMutation(api.responses.importMany)

  useEffect(() => {
    if (window.localStorage.getItem(DONE_KEY)) return
    const data = readLocalData()
    if (data.questionnaires.length > 0) setLocal(data)
  }, [])

  if (!local) return null

  async function upload() {
    if (!local) return
    setState('working')
    try {
      for (const questionnaire of local.questionnaires) {
        await saveQuestionnaire(encodeQuestionnaire(questionnaire) as never)
      }
      const imported = await importResponses({
        responses: local.responses.map((response) => ({
          ...response,
          answers: encodeAnswers(response.answers),
        })),
      })
      window.localStorage.setItem(DONE_KEY, String(Date.now()))
      setMessage(
        `Uploaded ${local.questionnaires.length} ${
          local.questionnaires.length === 1 ? 'survey' : 'surveys'
        } and ${imported} ${imported === 1 ? 'response' : 'responses'}.`,
      )
      setState('done')
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'The upload did not finish.')
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <div className="mt-6 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
        <Check className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <p>{message} Your browser copy is kept as a backup.</p>
      </div>
    )
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4">
      <CloudUpload className="size-5 shrink-0 text-primary" />
      <div className="min-w-56 flex-1">
        <p className="text-sm font-medium">
          {local.questionnaires.length}{' '}
          {local.questionnaires.length === 1 ? 'survey' : 'surveys'} and {local.responses.length}{' '}
          {local.responses.length === 1 ? 'response' : 'responses'} are saved in this browser only.
        </p>
        <p className="text-xs text-muted-foreground">
          Upload them to the server so every tablet on your team can see them.
          {state === 'error' && <span className="text-destructive"> {message}</span>}
        </p>
      </div>
      <Button type="button" disabled={state === 'working'} onClick={upload}>
        {state === 'working' ? 'Uploading…' : 'Upload to server'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          window.localStorage.setItem(DONE_KEY, 'dismissed')
          setLocal(null)
        }}
      >
        Not now
      </Button>
    </div>
  )
}
