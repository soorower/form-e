import { createFileRoute } from '@tanstack/react-router'
import { RequireAuth } from '#/components/auth/RequireAuth'
import { PrintPage, validatePrintSearch } from '#/components/pages/PrintPage'

/** Paper copies of a survey for a block of survey numbers: ?from=101&to=200&paper=legal. */
export const Route = createFileRoute('/surveys/$surveyId/print')({
  head: () => ({ meta: [{ title: 'Paper forms · Form-E' }] }),
  validateSearch: validatePrintSearch,
  component: PrintRoute,
})

function PrintRoute() {
  const { surveyId } = Route.useParams()
  const search = Route.useSearch()
  return (
    <RequireAuth>
      <PrintPage surveyId={surveyId} search={search} />
    </RequireAuth>
  )
}
