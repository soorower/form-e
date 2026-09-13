import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import {
  QuestionnaireRenderer,
  type QuestionnaireCardExposure,
} from '#/components/renderer/QuestionnaireRenderer'
import { useConvexReady } from '#/lib/convex/hooks'
import { decodeQuestionnaire } from '#/lib/convex/questionnaire-codec'
import { formatSurveyNumber } from '#/lib/questionnaire/factory'
import { getDeviceEnumerator, setDeviceEnumerator } from '#/lib/questionnaire/storage'
import type { SurveyResponse } from '#/lib/questionnaire/types'

export const Route = createFileRoute('/surveys/$surveyId/fill')({
  component: FillPage,
})

/** The respondent-facing page opened on the tablet in the field. */
function FillPage() {
  const { surveyId } = Route.useParams()
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

  return (
    <main className="page-wrap px-4 py-8 sm:py-12">
      <QuestionnaireRenderer
        questionnaire={questionnaire}
        meta={{
          serial: nextSerial,
          surveyNumber: formatSurveyNumber(questionnaire.surveyCodePrefix, nextSerial),
          enumerator,
          onEnumeratorChange: changeEnumerator,
        }}
        cardExposure={cardExposure}
        onSubmit={handleSubmit}
      />
      <p className="mt-8 text-center text-xs text-muted-foreground">
        <Link to="/surveys/$surveyId" params={{ surveyId }} className="hover:text-foreground">
          Back to the editor
        </Link>
      </p>
    </main>
  )
}
