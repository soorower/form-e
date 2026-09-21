import { createFileRoute } from '@tanstack/react-router'
import { RequireAuth } from '#/components/auth/RequireAuth'
import { DashboardPage } from '#/components/pages/DashboardPage'

export const Route = createFileRoute('/dashboard')({
  // ?team=<survey id> opens that team, e.g. from the editor or the chat page.
  validateSearch: (search: Record<string, unknown>): { team?: string } => ({
    team: typeof search.team === 'string' ? search.team : undefined,
  }),
  head: () => ({ meta: [{ title: 'Dashboard · Form-E' }] }),
  component: DashboardRoute,
})

/** Every approved account: builders see their surveys' teams, surveyors theirs. */
function DashboardRoute() {
  const { team } = Route.useSearch()
  return (
    <RequireAuth>
      <DashboardPage teamParam={team} />
    </RequireAuth>
  )
}
