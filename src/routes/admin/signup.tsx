import { createFileRoute } from '@tanstack/react-router'
import { AuthPage } from '#/components/auth/AuthPage'

/** Lets the admin create a password account for the admin email. */
export const Route = createFileRoute('/admin/signup')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  head: () => ({ meta: [{ title: 'Admin account · Form-E' }] }),
  component: AdminSignupPage,
})

function AdminSignupPage() {
  const { redirect } = Route.useSearch()
  return <AuthPage mode="signUp" area="admin" redirect={redirect} />
}
