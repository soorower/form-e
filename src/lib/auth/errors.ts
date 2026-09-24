import { ConvexError } from 'convex/values'
import { isAdminPath, type AuthArea } from './areas'

export type AuthMode = 'signIn' | 'signUp'

/**
 * Turns whatever `signIn` rejected with into one sentence for the form.
 * Custom validation errors travel as ConvexError data; the built-in ones come
 * back as plain Error messages (redacted to "Server Error" in production).
 */
export function authErrorMessage(error: unknown, mode: AuthMode): string {
  if (error instanceof ConvexError && typeof error.data === 'string') return error.data
  const message = error instanceof Error ? error.message : String(error)

  // Wrong password → InvalidSecret, unknown email → InvalidAccountId.
  if (/InvalidSecret|InvalidAccountId|invalid credentials/i.test(message)) {
    return 'Incorrect email or password.'
  }
  if (/already exists/i.test(message)) {
    return 'An account with this email already exists. Sign in instead.'
  }
  if (/invalid password/i.test(message)) return 'That password does not meet the requirements.'
  if (/failed to fetch|network/i.test(message)) {
    return 'Could not reach the server. Check your connection and try again.'
  }
  return mode === 'signUp'
    ? 'Could not create your account. Please try again.'
    : 'Could not sign you in. Please try again.'
}

/**
 * Only same-origin paths are honoured as a post-login destination, so a
 * crafted `?redirect=` cannot bounce someone to another site. With an `area`,
 * only paths inside that area: each area's sign-in keeps its OAuth verifier
 * in its own storage, so a sign-in that came back to the other area's page
 * could not be completed and ended signed out.
 * Creation pages save a new survey on mount, so they must never be a login
 * destination. The user can choose New survey after signing in instead.
 */
export function safeRedirect(
  redirect: string | undefined,
  fallback = '/surveys',
  area?: AuthArea,
): string {
  if (!redirect) return fallback
  if (!redirect.startsWith('/') || redirect.startsWith('//')) return fallback
  if (area && isAdminPath(redirect) !== (area === 'admin')) return fallback
  const pathname = redirect.split(/[?#]/, 1)[0].replace(/\/+$/, '')
  if (pathname === '/create' || pathname === '/admin/create') return fallback
  return redirect
}
