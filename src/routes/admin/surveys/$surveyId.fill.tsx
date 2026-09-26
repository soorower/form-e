import { createFileRoute } from '@tanstack/react-router'
import { FillPage } from '#/components/pages/FillPage'

/** The fill page opened from the admin area; records under the admin's name. */
export const Route = createFileRoute('/admin/surveys/$surveyId/fill')({
  // ?paper=37 types in the printed paper form numbered 37.
  validateSearch: (search: Record<string, unknown>): { steps?: boolean; paper?: number } => {
    const paper = Math.floor(Number(search.paper))
    return {
      steps: search.steps === true || search.steps === 1 || search.steps === '1' ? true : undefined,
      paper: Number.isFinite(paper) && paper >= 1 ? paper : undefined,
    }
  },
  component: AdminFillRoute,
})

function AdminFillRoute() {
  const { surveyId } = Route.useParams()
  const { steps, paper } = Route.useSearch()
  return <FillPage key={paper ?? 'tablet'} surveyId={surveyId} steps={steps} paperSerial={paper} />
}
