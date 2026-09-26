import { Email } from '@convex-dev/auth/providers/Email'
import { internal } from './_generated/api'
import type { ActionCtx } from './_generated/server'

type SendRequest = Parameters<typeof Email>[0]['sendVerificationRequest']

/** How long an emailed code works. */
export const CODE_MINUTES = 15

/** Eight random digits; Convex Auth also limits wrong guesses per account. */
function randomCode(): string {
  const digits = new Uint32Array(8)
  crypto.getRandomValues(digits)
  return Array.from(digits, (value) => String(value % 10)).join('')
}

/**
 * The code a password sign-up (`verify`) or a password reset (`reset`)
 * sends. The Password provider in convex/auth.ts uses them only when SMTP
 * is configured (convex/emailSettings.ts).
 */
export function emailCodeProvider(purpose: 'verify' | 'reset') {
  return Email({
    id: purpose === 'verify' ? 'password-verify' : 'password-reset',
    maxAge: CODE_MINUTES * 60,
    generateVerificationToken: async () => randomCode(),
    // Convex Auth passes the action context as a second argument, which its
    // Auth.js-derived typing leaves out (see implementation/signIn.ts).
    sendVerificationRequest: (async (
      { identifier, token }: { identifier: string; token: string },
      ctx: ActionCtx,
    ) => {
      // Nodemailer needs Node, so the sending happens in a Node action.
      await ctx.runAction(internal.email.sendCode, {
        to: identifier,
        code: token,
        purpose,
        minutes: CODE_MINUTES,
      })
    }) as unknown as SendRequest,
  })
}
