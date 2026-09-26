import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useAuthActions } from '@convex-dev/auth/react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { useConvexReady } from '#/lib/convex/hooks'
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

const CODE_ERROR = 'That code is wrong or has expired. Check the latest email and try again.'

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
/**
 * Where a password sign-in stands: the ordinary form, a code sent to the
 * address to prove it, or a forgotten password (ask for the address, then
 * the code and a new password).
 */
type Step =
  | { kind: 'form' }
  | { kind: 'code'; email: string; name: string }
  | { kind: 'forgot' }
  | { kind: 'reset'; email: string }

export function AuthForm({ mode, area = 'app', redirect }: AuthFormProps) {
  const { signIn } = useAuthActions()
  const navigate = useNavigate()
  const ready = useConvexReady()
  const options = useQuery(api.users.authOptions, ready ? {} : 'skip')
  const setMyName = useMutation(api.users.setMyName)
  const [pending, setPending] = useState<'password' | 'google' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<Step>({ kind: 'form' })
  const [notice, setNotice] = useState<string | null>(null)
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
        await finish(String(data.get('name') ?? ''))
      } else {
        // The address is not proved yet: a code is on its way to it.
        setStep({
          kind: 'code',
          email: String(data.get('email') ?? '').trim().toLowerCase(),
          name: String(data.get('name') ?? ''),
        })
        setNotice(null)
      }
    } catch (err) {
      setError(authErrorMessage(err, mode))
    } finally {
      setPending(null)
    }
  }

  /** Signed in: keep the name typed at sign-up (once proved), then go on. */
  async function finish(name: string) {
    if (name.trim()) await setMyName({ name }).catch(() => undefined)
    await navigate({ href: target, replace: true })
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (step.kind !== 'code') return
    const code = String(new FormData(event.currentTarget).get('code') ?? '').replace(/\s/g, '')
    setError(null)
    setPending('password')
    try {
      const { signingIn } = await signIn('password', {
        flow: 'email-verification',
        email: step.email,
        code,
      })
      if (signingIn) await finish(step.name)
      else setError(CODE_ERROR)
    } catch {
      // In production every failure here reads "Server Error"; in this step
      // it can only mean the code.
      setError(CODE_ERROR)
    } finally {
      setPending(null)
    }
  }

  async function sendResetCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim().toLowerCase()
    setError(null)
    setPending('password')
    try {
      await signIn('password', { flow: 'reset', email })
      setStep({ kind: 'reset', email })
      setNotice(null)
    } catch {
      setError('No password account uses that email, or the code could not be sent. Check the address and try again.')
    } finally {
      setPending(null)
    }
  }

  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (step.kind !== 'reset') return
    const data = new FormData(event.currentTarget)
    const newPassword = String(data.get('newPassword') ?? '')
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`)
      return
    }
    setError(null)
    setPending('password')
    try {
      const { signingIn } = await signIn('password', {
        flow: 'reset-verification',
        email: step.email,
        code: String(data.get('code') ?? '').replace(/\s/g, ''),
        newPassword,
      })
      if (signingIn) await finish('')
      else setError(CODE_ERROR)
    } catch {
      setError(CODE_ERROR)
    } finally {
      setPending(null)
    }
  }

  function backToForm() {
    setStep({ kind: 'form' })
    setError(null)
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

  if (step.kind !== 'form') {
    return (
      <Card className="w-full shadow-xl shadow-indigo-500/5 ring-foreground/10 [--card-spacing:--spacing(6)]">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-extrabold tracking-tight">
            {step.kind === 'code'
              ? 'Check your email'
              : step.kind === 'forgot'
                ? 'Reset your password'
                : 'Choose a new password'}
          </CardTitle>
          <CardDescription>
            {step.kind === 'code'
              ? `We sent an 8-digit code to ${step.email}. Enter it to confirm the address; it works for 15 minutes.`
              : step.kind === 'forgot'
                ? 'Enter the email of your password account and we will send you a code.'
                : `Enter the code sent to ${step.email} and your new password.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={(event) =>
              void (step.kind === 'code'
                ? submitCode(event)
                : step.kind === 'forgot'
                  ? sendResetCode(event)
                  : submitReset(event))
            }
            className="space-y-4"
          >
            {step.kind === 'forgot' ? (
              <div className="space-y-2">
                <Label htmlFor="auth-reset-email">Email</Label>
                <Input
                  id="auth-reset-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="h-11 rounded-xl"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="auth-code">Code</Label>
                <Input
                  id="auth-code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="12345678"
                  required
                  className="h-11 rounded-xl text-center font-mono text-lg tracking-[0.3em]"
                />
              </div>
            )}
            {step.kind === 'reset' && (
              <div className="space-y-2">
                <Label htmlFor="auth-new-password">New password</Label>
                <Input
                  id="auth-new-password"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  className="h-11 rounded-xl"
                />
              </div>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
            <Button
              type="submit"
              size="lg"
              className="h-11 w-full rounded-xl font-bold"
              disabled={pending !== null}
            >
              {pending === 'password' && <Loader2 data-icon="inline-start" className="animate-spin" />}
              {step.kind === 'code' ? 'Confirm' : step.kind === 'forgot' ? 'Send code' : 'Save and sign in'}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            {step.kind === 'code' && (
              <>
                No email? Check spam, or{' '}
                <button
                  type="button"
                  className="font-semibold text-primary underline-offset-4 hover:underline"
                  onClick={backToForm}
                >
                  go back
                </button>{' '}
                and sign in again to get a new code.
              </>
            )}
            {step.kind !== 'code' && (
              <button
                type="button"
                className="font-semibold text-primary underline-offset-4 hover:underline"
                onClick={backToForm}
              >
                Back to sign in
              </button>
            )}
          </p>
        </CardContent>
      </Card>
    )
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

        {!isSignUp && options?.emailCodes && (
          <p className="-mt-2 text-center text-sm">
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => {
                setStep({ kind: 'forgot' })
                setError(null)
              }}
            >
              Forgot password?
            </button>
          </p>
        )}

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
