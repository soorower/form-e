import { createFileRoute } from '@tanstack/react-router'
import { RequireAuth } from '#/components/auth/RequireAuth'
import { CreatePage } from '#/components/pages/CreatePage'

/** New survey, created by the admin on the admin session. */
export const Route = createFileRoute('/admin/create')({
  component: AdminCreateRoute,
})

function AdminCreateRoute() {
  return (
    <RequireAuth builder>
      <CreatePage />
    </RequireAuth>
  )
}
