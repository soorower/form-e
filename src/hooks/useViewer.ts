import { useConvexAuth, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../convex/_generated/api'
import { useConvexReady } from '#/lib/convex/hooks'

/** The signed-in user as `users.viewer` returns it: profile, role, and groups. */
export type Viewer = NonNullable<FunctionReturnType<typeof api.users.viewer>>

/**
 * Auth state plus the signed-in user's profile and what they may do.
 * `loading` stays true during SSR and the first client render so the header
 * markup matches on hydration. `approved` (admin, or in an approved group)
 * is what the surveys and dashboard pages check; `isAdmin` opens /admin.
 */
export function useViewer() {
  const ready = useConvexReady()
  const { isLoading, isAuthenticated } = useConvexAuth()
  const viewer = useQuery(api.users.viewer, ready && isAuthenticated ? {} : 'skip')

  return {
    loading: !ready || isLoading || (isAuthenticated && viewer === undefined),
    isAuthenticated: ready && isAuthenticated,
    viewer: (viewer ?? null) as Viewer | null,
    isAdmin: viewer?.role === 'admin',
    /** Approved surveyor: fills assigned surveys, sees team progress and chat only. */
    isSurveyor: viewer?.role === 'surveyor',
    /** Admin or approved builder: may create and edit surveys and see answers. */
    canBuild: viewer?.canBuild ?? false,
    approved: viewer?.approved ?? false,
  }
}
