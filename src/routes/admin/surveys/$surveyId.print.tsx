import { createFileRoute } from '@tanstack/react-router'
import { RequireAuth } from '#/components/auth/RequireAuth'
import { PrintPage, validatePrintSearch } from '#/components/pages/PrintPage'

/** Paper copies of a survey on the admin session. */
export const Route = createFileRoute('/admin/surveys/$surveyId/print')({
  head: () => ({ meta: [{ title: 'Paper forms · Admin · Form-E' }] }),
  validateSearch: validatePrintSearch,
  component: AdminPrintRoute,
})

function AdminPrintRoute() {
  const { surveyId } = Route.useParams()
  const search = Route.useSearch()
  return (
    <RequireAuth>
      <PrintPage surveyId={surveyId} search={search} />
    </RequireAuth>
  )
}
