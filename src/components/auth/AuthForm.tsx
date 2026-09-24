import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useAuthActions } from '@convex-dev/auth/react'
import { Loader2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Separator } from '#/components/ui/separator'
import { AUTH_AREAS, type AuthArea } from '#/lib/auth/areas'
import { authErrorMessage, safeRedirect, type AuthMode } from '#/lib/auth/errors'
import { GoogleIcon } from './GoogleIcon'

const MIN_PASSWORD_LENGTH = 8

interface AuthFormProps {
  mode: AuthMode
  /** Which sign-in area this form belongs to: the app or the admin panel. */
  area?: AuthArea
  /** Same-origin path to land on afterwards; kept in links between the two pages. */
  redirect?: string
}

const COPY = {
  app: {
    signIn: { title: 'Welcome back', text: 'Sign in to manage your surveys and responses.' },
    signUp: {
      title: 'Create your account',
      text: 'Start building questionnaires for your survey team.',
    },
  },
  admin: {
    signIn: {
      title: 'Admin sign in',
      text: 'Sign in with the admin account to manage groups and access.',
    },
    signUp: {
      title: 'Create the admin account',
      text: 'Use the email set as admin on the deployment; other accounts cannot get in here.',
    },
  },
} as const

/**
 * Sign in / sign up card: Google first, then email + password. Both paths end
 * on `redirect` (default: the area's home page). Google leaves the page for
 * the provider and comes back with a `?code=` that the area's
 * ConvexAuthProvider exchanges.
 */
export function AuthForm({ mode, area = 'app', redirect }: AuthFormProps) {
  const { signIn } = useAuthActions()
  const navigate = useNavigate()
  const [pending, setPending] = useState<'password' | 'google' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const paths = AUTH_AREAS[area]
  const target = safeRedirect(redirect, paths.home, area)
  const isSignUp = mode === 'signUp'
  const copy = COPY[area][mode]

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    data.set('flow', mode)
    setError(null)
    setPending('password')
    try {
      const { signingIn } = await signIn('password', data)
      if (signingIn) {
        await navigate({ href: target, replace: true })
      } else {
        setError('Sign-in did not complete. Please try again.')
      }
    } catch (err) {
      setError(authErrorMessage(err, mode))
    } finally {
      setPending(null)
    }
  }

  async function continueWithGoogle() {
    setError(null)
    setPending('google')
    try {
      // Absolute, so the code comes back to this origin (its storage holds the
      // verifier); the server checks it against SITE_URL / EXTRA_SITE_URLS.
      await signIn('google', { redirectTo: window.location.origin + target })
      // The browser is now navigating to Google; keep the spinner until then.
    } catch (err) {
      setError(authErrorMessage(err, mode))
      setPending(null)
    }
  }

  return (
    <Card className="w-full shadow-xl shadow-indigo-500/5 ring-foreground/10 [--card-spacing:--spacing(6)]">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-extrabold tracking-tight">{copy.title}</CardTitle>
        <CardDescription>{copy.text}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11 w-full rounded-xl font-semibold"
          onClick={() => void continueWithGoogle()}
          disabled={pending !== null}
        >
          {pending === 'google' ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <GoogleIcon data-icon="inline-start" className="size-4" />
          )}
          Continue with Google
        </Button>

        <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <Separator className="flex-1" />
          or
          <Separator className="flex-1" />
        </div>

        <form onSubmit={(event) => void submitPassword(event)} className="space-y-4" noValidate={false}>
          {isSignUp && (
            <div className="space-y-2">
              <Label htmlFor="auth-name">Full name</Label>
              <Input
                id="auth-name"
                name="name"
                autoComplete="name"
                placeholder="Your name"
                required
                className="h-11 rounded-xl"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="auth-email">Email</Label>
            <Input
              id="auth-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              className="h-11 rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="auth-password">Password</Label>
            <Input
              id="auth-password"
              name="password"
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              placeholder={isSignUp ? `At least ${MIN_PASSWORD_LENGTH} characters` : 'Your password'}
              required
              minLength={isSignUp ? MIN_PASSWORD_LENGTH : undefined}
              className="h-11 rounded-xl"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            className="h-11 w-full rounded-xl font-bold"
            disabled={pending !== null}
          >
            {pending === 'password' && <Loader2 data-icon="inline-start" className="animate-spin" />}
            {isSignUp ? 'Create account' : 'Sign in'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {isSignUp ? (
            <>
              Already have an account?{' '}
              <Link
                to={paths.login}
                search={{ redirect }}
                className="font-semibold text-primary underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </>
          ) : (
            <>
              New to Form-E?{' '}
              <Link
                to={paths.signup}
                search={{ redirect }}
                className="font-semibold text-primary underline-offset-4 hover:underline"
              >
                Create an account
              </Link>
            </>
          )}
        </p>
      </CardContent>
    </Card>
  )
}
