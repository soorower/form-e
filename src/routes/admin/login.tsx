import { createFileRoute } from '@tanstack/react-router'
import { AuthPage } from '#/components/auth/AuthPage'

/** Sign-in for the admin area; a separate session from the app's /login. */
export const Route = createFileRoute('/admin/login')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  head: () => ({ meta: [{ title: 'Admin sign in · Form-E' }] }),
  component: AdminLoginPage,
})

function AdminLoginPage() {
  const { redirect } = Route.useSearch()
  return <AuthPage mode="signIn" area="admin" redirect={redirect} />
}
