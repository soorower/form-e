import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import {
  QuestionnaireRenderer,
  type QuestionnaireCardExposure,
} from '#/components/renderer/QuestionnaireRenderer'
import { useSurveyPaths } from '#/components/auth/area'
import { useViewer } from '#/hooks/useViewer'
import { useConvexReady } from '#/lib/convex/hooks'
import { decodeQuestionnaire } from '#/lib/convex/questionnaire-codec'
import { formatSurveyNumber } from '#/lib/questionnaire/factory'
import { getDeviceEnumerator, setDeviceEnumerator } from '#/lib/questionnaire/storage'
import type { SurveyResponse } from '#/lib/questionnaire/types'

/**
 * The respondent-facing page opened on the tablet in the field. Public, so a
 * shared tablet works without signing in (the enumerator picks a name). A
 * signed-in surveyor is recorded under their own account name and walks
 * through the questions one at a time.
 */
export function FillPage({ surveyId, steps }: { surveyId: string; steps?: boolean }) {
  const paths = useSurveyPaths()
  const ready = useConvexReady()
  const questionnaire = decodeQuestionnaire(
    useQuery(api.questionnaires.get, ready ? { id: surveyId } : 'skip'),
  )
  const serial = useQuery(api.responses.nextSerial, ready ? { questionnaireId: surveyId } : 'skip')
  const exposureRows = useQuery(
    api.responses.cardExposure,
    ready ? { questionnaireId: surveyId } : 'skip',
  )
  const submit = useMutation(api.responses.submit)
  const { viewer, isSurveyor, canBuild } = useViewer()
  const [enumerator, setEnumerator] = useState('')

  useEffect(() => {
    setEnumerator(getDeviceEnumerator())
  }, [])

  /** The server assigns the real serial; it returns the number actually used. */
  async function handleSubmit(response: SurveyResponse) {
    const saved = await submit({
      id: response.id,
      questionnaireId: response.questionnaireId,
      enumerator: response.enumerator,
      language: response.language,
      answers: response.answers,
    })
    return saved.surveyNumber
  }

  function changeEnumerator(name: string) {
    setEnumerator(name)
    setDeviceEnumerator(name)
  }

  if (questionnaire === undefined) {
    return <main className="page-wrap px-4 py-12 text-muted-foreground">Loading…</main>
  }

  if (questionnaire === null) {
    return (
      <main className="page-wrap px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Survey not found</h1>
        <p className="mt-2 text-muted-foreground">
          This survey may have been deleted.
        </p>
      </main>
    )
  }

  const nextSerial = serial ?? 1

  // undefined while loading, so a balanced block waits instead of drawing blind.
  let cardExposure: QuestionnaireCardExposure | undefined
  if (exposureRows !== undefined) {
    cardExposure = {}
    for (const { questionId, set, count } of exposureRows) {
      cardExposure[questionId] = { ...(cardExposure[questionId] ?? {}), [set]: count }
    }
  }

  // A signed-in, approved account collects under its own name; the server
  // stamps the account onto the response as well.
  const account = viewer?.approved ? viewer : null
  const stepped = isSurveyor || steps === true
  const lockedName = account
    ? account.code
      ? `${account.displayName} (${account.code})`
      : account.displayName
    : null

  return (
    <main className="page-wrap px-4 py-8 sm:py-12">
      <QuestionnaireRenderer
        key={stepped ? 'steps' : 'page'}
        questionnaire={questionnaire}
        meta={
          account
            ? {
                serial: nextSerial,
                surveyNumber: formatSurveyNumber(questionnaire.surveyCodePrefix, nextSerial),
                enumerator: account.displayName,
                locked: true,
              }
            : {
                serial: nextSerial,
                surveyNumber: formatSurveyNumber(questionnaire.surveyCodePrefix, nextSerial),
                enumerator,
                onEnumeratorChange: changeEnumerator,
              }
        }
        cardExposure={cardExposure}
        onSubmit={handleSubmit}
        mode={stepped ? 'steps' : 'page'}
      />
      <p className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-xs text-muted-foreground">
        {lockedName && <span>Collecting as {lockedName}</span>}
        {account && (
          <Link to={paths.chat} params={{ surveyId }} className="hover:text-foreground">
            Team chat
          </Link>
        )}
        {isSurveyor && (
          <Link to={paths.list} className="hover:text-foreground">
            Back to my surveys
          </Link>
        )}
        {canBuild && (
          <Link to={paths.editor} params={{ surveyId }} className="hover:text-foreground">
            Back to the editor
          </Link>
        )}
      </p>
    </main>
  )
}
