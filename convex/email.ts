'use node'

import { v } from 'convex/values'
import nodemailer from 'nodemailer'
import { internalAction } from './_generated/server'
import { emailSettings } from './emailSettings'

/**
 * Sends a sign-up or password-reset code by SMTP. Any SMTP server works:
 * Gmail with an app password (smtp.gmail.com, the default), Brevo, Resend,
 * a university server. Configured on the deployment with SMTP_USER and
 * SMTP_PASS (plus SMTP_HOST / SMTP_PORT / EMAIL_FROM when not Gmail).
 */
export const sendCode = internalAction({
  args: {
    to: v.string(),
    code: v.string(),
    purpose: v.union(v.literal('verify'), v.literal('reset')),
    minutes: v.number(),
  },
  handler: async (_ctx, { to, code, purpose, minutes }) => {
    const settings = emailSettings()
    if (!settings) throw new Error('Email is not configured on this deployment (SMTP_USER / SMTP_PASS).')
    const transport = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.port === 465,
      auth: { user: settings.user, pass: settings.pass },
    })
    const verify = purpose === 'verify'
    const subject = verify ? `Your Form-E code: ${code}` : `Reset your Form-E password: ${code}`
    const lead = verify
      ? 'Enter this code on the Form-E sign-up page to confirm your email address:'
      : 'Enter this code on the Form-E page to choose a new password:'
    const text = [
      lead,
      '',
      `    ${code}`,
      '',
      `It works for ${minutes} minutes. If you did not ask for it, ignore this email: nothing changes without the code.`,
      '',
      '— Form-E',
    ].join('\n')
    await transport.sendMail({ from: settings.from, to, subject, text })
  },
})
