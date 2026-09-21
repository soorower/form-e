import { createFileRoute } from '@tanstack/react-router'
import { RequireAuth } from '#/components/auth/RequireAuth'
import { DashboardPage } from '#/components/pages/DashboardPage'

/** Every team's progress, on the admin session. */
export const Route = createFileRoute('/admin/dashboard')({
  validateSearch: (search: Record<string, unknown>): { team?: string } => ({
    team: typeof search.team === 'string' ? search.team : undefined,
  }),
  head: () => ({ meta: [{ title: 'Dashboard · Admin · Form-E' }] }),
  component: AdminDashboardRoute,
})

function AdminDashboardRoute() {
  const { team } = Route.useSearch()
  return (
    <RequireAuth>
      <DashboardPage teamParam={team} />
    </RequireAuth>
  )
}
