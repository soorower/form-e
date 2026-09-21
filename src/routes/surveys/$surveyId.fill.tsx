import { createFileRoute } from '@tanstack/react-router'
import { FillPage } from '#/components/pages/FillPage'

/** Public: the tablet fill page needs no sign-in. */
export const Route = createFileRoute('/surveys/$surveyId/fill')({
  // ?steps=1 shows one question at a time for anyone, the way surveyors
  // always get it, so a builder can try that flow.
  validateSearch: (search: Record<string, unknown>): { steps?: boolean } => ({
    steps: search.steps === true || search.steps === 1 || search.steps === '1' ? true : undefined,
  }),
  component: FillRoute,
})

function FillRoute() {
  const { surveyId } = Route.useParams()
  const { steps } = Route.useSearch()
  return <FillPage surveyId={surveyId} steps={steps} />
}
