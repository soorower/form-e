import { createFileRoute } from '@tanstack/react-router'
import { AuthPage } from '#/components/auth/AuthPage'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  head: () => ({ meta: [{ title: 'Sign in · Form-E' }] }),
  component: LoginPage,
})

function LoginPage() {
  const { redirect } = Route.useSearch()
  return <AuthPage mode="signIn" redirect={redirect} />
}
