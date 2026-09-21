import { createFileRoute } from '@tanstack/react-router'
import { RequireAuth } from '#/components/auth/RequireAuth'
import { SurveysPage } from '#/components/pages/SurveysPage'

/** The surveys list on the admin session (every survey). */
export const Route = createFileRoute('/admin/surveys/')({
  head: () => ({ meta: [{ title: 'Surveys · Admin · Form-E' }] }),
  component: AdminSurveysRoute,
})

function AdminSurveysRoute() {
  return (
    <RequireAuth>
      <SurveysPage />
    </RequireAuth>
  )
}
