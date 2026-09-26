/**
 * The SMTP settings on the deployment, or null when email is not set up.
 * Kept free of Node imports so convex/auth.ts can check it too: password
 * sign-ups are only asked for a code once a code can actually be sent.
 */
export function emailSettings(): {
  host: string
  port: number
  user: string
  pass: string
  from: string
} | null {
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS?.trim()
  if (!user || !pass) return null
  const port = Number(process.env.SMTP_PORT ?? 465)
  return {
    host: process.env.SMTP_HOST?.trim() || 'smtp.gmail.com',
    port: Number.isFinite(port) && port > 0 ? port : 465,
    user,
    pass,
    from: process.env.EMAIL_FROM?.trim() || `Form-E <${user}>`,
  }
}
