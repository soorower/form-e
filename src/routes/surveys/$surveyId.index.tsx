import { createFileRoute } from '@tanstack/react-router'
import { RequireAuth } from '#/components/auth/RequireAuth'
import { SurveyEditorPage } from '#/components/pages/SurveyEditorPage'

export const Route = createFileRoute('/surveys/$surveyId/')({
  component: SurveyEditorRoute,
})

/** The editor is for builders; the fill route next to it stays public. */
function SurveyEditorRoute() {
  const { surveyId } = Route.useParams()
  return (
    <RequireAuth builder>
      <SurveyEditorPage surveyId={surveyId} />
    </RequireAuth>
  )
}
