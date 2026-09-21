import { createFileRoute } from '@tanstack/react-router'
import { RequireAuth } from '#/components/auth/RequireAuth'
import { SurveyEditorPage } from '#/components/pages/SurveyEditorPage'

/** The survey editor on the admin session. */
export const Route = createFileRoute('/admin/surveys/$surveyId/')({
  component: AdminSurveyEditorRoute,
})

function AdminSurveyEditorRoute() {
  const { surveyId } = Route.useParams()
  return (
    <RequireAuth builder>
      <SurveyEditorPage surveyId={surveyId} />
    </RequireAuth>
  )
}
