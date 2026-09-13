import { useConvexAuth, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useConvexReady } from '#/lib/convex/hooks'

/**
 * Auth state plus the signed-in user's profile. `loading` stays true during
 * SSR and the first client render so the header markup matches on hydration.
 */
export function useViewer() {
  const ready = useConvexReady()
  const { isLoading, isAuthenticated } = useConvexAuth()
  const viewer = useQuery(api.users.viewer, ready && isAuthenticated ? {} : 'skip')

  return {
    loading: !ready || isLoading || (isAuthenticated && viewer === undefined),
    isAuthenticated: ready && isAuthenticated,
    viewer: viewer ?? null,
  }
}
