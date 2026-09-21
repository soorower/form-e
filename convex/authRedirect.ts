/**
 * Where an OAuth sign-in may land afterwards. Convex Auth only knows
 * SITE_URL, so one deployment could send people back to localhost or to the
 * hosted site, never both. Here a relative `redirectTo` still goes to
 * SITE_URL, and an absolute one is accepted when its origin is SITE_URL's or
 * one listed in EXTRA_SITE_URLS (comma-separated). Anything else is refused:
 * the sign-in code travels on this URL, so it must never reach a site that
 * is not ours. Origins are compared exactly; a prefix check would let
 * `https://our.site.evil.com` through.
 */
export function resolveRedirect(
  redirectTo: string,
  siteUrl: string | undefined,
  extraSiteUrls: string | undefined,
): string {
  if (redirectTo.startsWith('/') || redirectTo.startsWith('?')) {
    if (!siteUrl) throw new Error('Missing environment variable `SITE_URL`')
    return `${siteUrl.replace(/\/$/, '')}${redirectTo}`
  }
  const origin = originOf(redirectTo)
  if (origin !== null && allowedOrigins(siteUrl, extraSiteUrls).has(origin)) {
    // The parsed form, so what was checked is exactly what is followed.
    return new URL(redirectTo).href
  }
  throw new Error(
    `Invalid \`redirectTo\` ${redirectTo}: not on SITE_URL or one of EXTRA_SITE_URLS`,
  )
}

/** Origins a sign-in may return to: SITE_URL's plus every EXTRA_SITE_URLS entry. */
export function allowedOrigins(
  siteUrl: string | undefined,
  extraSiteUrls: string | undefined,
): Set<string> {
  const origins = [siteUrl ?? '', ...(extraSiteUrls ?? '').split(',')].map(originOf)
  return new Set(origins.filter((origin): origin is string => origin !== null))
}

function originOf(url: string): string | null {
  try {
    const { protocol, origin } = new URL(url.trim())
    return protocol === 'http:' || protocol === 'https:' ? origin : null
  } catch {
    return null
  }
}
