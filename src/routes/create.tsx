import { createFileRoute } from '@tanstack/react-router'
import { RequireAuth } from '#/components/auth/RequireAuth'
import { CreatePage } from '#/components/pages/CreatePage'

export const Route = createFileRoute('/create')({
  component: CreateRoute,
})

function CreateRoute() {
  return (
    <RequireAuth builder>
      <CreatePage />
    </RequireAuth>
  )
}
