import { useEffect, useState } from 'react'
import { useConvexAuth, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../convex/_generated/api'
import { useArea } from '#/components/auth/area'
import { useConvexReady } from '#/lib/convex/hooks'

/** The signed-in user as `users.viewer` returns it: profile, role, and groups. */
export type Viewer = NonNullable<FunctionReturnType<typeof api.users.viewer>>

/**
 * How long a signed-in tablet waits for the server to confirm who is signed
 * in before it carries on as the account it last saw. With no connection
 * that confirmation never comes, and every page waited on it for good.
 */
export const OFFLINE_VIEWER_GRACE_MS = 5_000

const cacheKey = (area: string) => `forme:viewer:${area}`

function readCachedViewer(area: string): Viewer | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(area))
    return raw ? (JSON.parse(raw) as Viewer) : null
  } catch {
    return null
  }
}

function writeCachedViewer(area: string, viewer: Viewer | null) {
  try {
    if (viewer) window.localStorage.setItem(cacheKey(area), JSON.stringify(viewer))
    else window.localStorage.removeItem(cacheKey(area))
  } catch {
    // Only the offline fallback is lost.
  }
}

/**
 * Auth state plus the signed-in user's profile and what they may do.
 * `loading` stays true during SSR and the first client render so the header
 * markup matches on hydration. `approved` (admin, or in an approved group)
 * is what the surveys and dashboard pages check; `isAdmin` opens /admin.
 *
 * Offline, a signed-in tablet never hears back from the server, so after
 * `OFFLINE_VIEWER_GRACE_MS` (at once when the tablet knows it is offline)
 * this answers with the account last seen on this device, marked `offline`.
 * It only decides what the pages show; the server checks every request.
 */
export function useViewer() {
  const ready = useConvexReady()
  const area = useArea()
  const { isLoading, isAuthenticated } = useConvexAuth()
  const viewer = useQuery(api.users.viewer, ready && isAuthenticated ? {} : 'skip')
  const liveLoading = !ready || isLoading || (isAuthenticated && viewer === undefined)
  const [gaveUp, setGaveUp] = useState(false)

  useEffect(() => {
    if (viewer) writeCachedViewer(area, viewer)
    // Signed out (or the account is gone): nothing to fall back on any more.
    else if (ready && !isLoading && (!isAuthenticated || viewer === null)) writeCachedViewer(area, null)
  }, [area, ready, isLoading, isAuthenticated, viewer])

  useEffect(() => {
    if (!ready || !liveLoading) {
      setGaveUp(false)
      return
    }
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    const timer = setTimeout(() => setGaveUp(true), offline ? 0 : OFFLINE_VIEWER_GRACE_MS)
    return () => clearTimeout(timer)
  }, [ready, liveLoading])

  const cached = ready && liveLoading && gaveUp ? readCachedViewer(area) : null
  const current = cached ?? ((viewer ?? null) as Viewer | null)

  return {
    loading: cached ? false : liveLoading,
    isAuthenticated: cached ? true : ready && isAuthenticated,
    viewer: current,
    /** True while showing the account last seen here because the server cannot be reached. */
    offline: cached !== null,
    isAdmin: current?.role === 'admin',
    /** Approved surveyor: fills assigned surveys, sees team progress and chat only. */
    isSurveyor: current?.role === 'surveyor',
    /** Admin or approved builder: may create and edit surveys and see answers. */
    canBuild: current?.canBuild ?? false,
    approved: current?.approved ?? false,
  }
}
