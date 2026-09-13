import { createFileRoute } from '@tanstack/react-router'
import { AuthPage } from '#/components/auth/AuthPage'

export const Route = createFileRoute('/signup')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  head: () => ({ meta: [{ title: 'Create account · Form-E' }] }),
  component: SignupPage,
})

function SignupPage() {
  const { redirect } = Route.useSearch()
  return <AuthPage mode="signUp" redirect={redirect} />
}
