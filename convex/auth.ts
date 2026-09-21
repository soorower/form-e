import Google from '@auth/core/providers/google'
import { Password } from '@convex-dev/auth/providers/Password'
import { convexAuth } from '@convex-dev/auth/server'
import { ConvexError } from 'convex/values'
import type { DataModel } from './_generated/dataModel'
import { resolveRedirect } from './authRedirect'

export const MIN_PASSWORD_LENGTH = 8

/**
 * Two ways in: Google OAuth (needs AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET on the
 * deployment) and email + password. Both create rows in the `users` table
 * that `authTables` adds to the schema.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google,
    Password<DataModel>({
      profile(params) {
        const name = typeof params.name === 'string' ? params.name.trim() : ''
        return {
          email: (params.email as string).trim().toLowerCase(),
          ...(name ? { name } : {}),
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
