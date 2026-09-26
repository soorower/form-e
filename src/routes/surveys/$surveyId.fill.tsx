import { createFileRoute } from '@tanstack/react-router'
import { FillPage } from '#/components/pages/FillPage'

/** Public: the tablet fill page needs no sign-in. */
export const Route = createFileRoute('/surveys/$surveyId/fill')({
  // ?steps=1 shows one question at a time for anyone, the way surveyors
  // always get it, so a builder can try that flow.
  // ?paper=37 types in the printed paper form numbered 37.
  validateSearch: (search: Record<string, unknown>): { steps?: boolean; paper?: number } => {
    const paper = Math.floor(Number(search.paper))
    return {
      steps: search.steps === true || search.steps === 1 || search.steps === '1' ? true : undefined,
      paper: Number.isFinite(paper) && paper >= 1 ? paper : undefined,
    }
  },
  component: FillRoute,
})

function FillRoute() {
  const { surveyId } = Route.useParams()
  const { steps, paper } = Route.useSearch()
  return <FillPage key={paper ?? 'tablet'} surveyId={surveyId} steps={steps} paperSerial={paper} />
}
