import { createFileRoute } from '@tanstack/react-router'
import { FillPage } from '#/components/pages/FillPage'

/** The fill page opened from the admin area; records under the admin's name. */
export const Route = createFileRoute('/admin/surveys/$surveyId/fill')({
  validateSearch: (search: Record<string, unknown>): { steps?: boolean } => ({
    steps: search.steps === true || search.steps === 1 || search.steps === '1' ? true : undefined,
  }),
  component: AdminFillRoute,
})

function AdminFillRoute() {
  const { surveyId } = Route.useParams()
  const { steps } = Route.useSearch()
  return <FillPage surveyId={surveyId} steps={steps} />
}
