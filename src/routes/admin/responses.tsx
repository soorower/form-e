import { createFileRoute } from '@tanstack/react-router'
import { RequireAuth } from '#/components/auth/RequireAuth'
import { ResponsesPage } from '#/components/pages/ResponsesPage'

/** Every survey team's responses and downloads, on the admin session. */
export const Route = createFileRoute('/admin/responses')({
  validateSearch: (search: Record<string, unknown>): { survey?: string } => ({
    survey: typeof search.survey === 'string' ? search.survey : undefined,
  }),
  head: () => ({ meta: [{ title: 'Responses · Admin · Form-E' }] }),
  component: AdminResponsesRoute,
})

function AdminResponsesRoute() {
  const { survey } = Route.useSearch()
  return (
    <RequireAuth>
      <ResponsesPage surveyParam={survey} />
    </RequireAuth>
  )
}
