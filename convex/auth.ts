import Google from '@auth/core/providers/google'
import { Password } from '@convex-dev/auth/providers/Password'
import { convexAuth } from '@convex-dev/auth/server'
import { ConvexError } from 'convex/values'
import type { DataModel } from './_generated/dataModel'
import { emailCodeProvider } from './authEmail'
import { resolveRedirect } from './authRedirect'
import { emailSettings } from './emailSettings'

/**
 * With SMTP set up, a password sign-up must enter a code sent to the address
 * before it can sign in, and a forgotten password can be reset by code.
 * Until then password accounts work as before: unproved, so they wait for
 * the admin's approval (convex/access.ts).
 */
const emailCodes = emailSettings() !== null

export const MIN_PASSWORD_LENGTH = 8

/**
 * Two ways in: Google OAuth (needs AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET on the
 * deployment) and email + password, with an emailed code when SMTP is set
 * up. Both create rows in the `users` table that `authTables` adds.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google,
    Password<DataModel>({
      ...(emailCodes
        ? { verify: emailCodeProvider('verify'), reset: emailCodeProvider('reset') }
        : {}),
      profile(params) {
        const name = typeof params.name === 'string' ? params.name.trim() : ''
        return {
          email: (params.email as string).trim().toLowerCase(),
          // With codes on, a sign-up is attached to an existing account with
          // the same proved address before the code is entered, and its
          // profile is written onto it: a stranger could rename your account.
          // The name is saved after the code instead (users.setMyName).
          ...(name && !emailCodes ? { name } : {}),
        }
      },
      validatePasswordRequirements(password) {
        if (password.length < MIN_PASSWORD_LENGTH) {
          throw new ConvexError(
            `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
          )
        }
      },
    }),
  ],
  callbacks: {
    // Google sign-in returns to the origin it started on: SITE_URL (localhost
    // in dev) or a hosted origin listed in EXTRA_SITE_URLS.
    async redirect({ redirectTo }) {
      return resolveRedirect(redirectTo, process.env.SITE_URL, process.env.EXTRA_SITE_URLS)
    },
  },
})
