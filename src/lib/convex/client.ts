import { ConvexReactClient } from 'convex/react'

/**
 * One Convex client for the whole app. The constructor does not open a
 * connection; the websocket is created when the first query subscribes, which
 * only happens in the browser because every hook skips while rendering on the
 * server (see useConvexReady).
 */
const url = import.meta.env.VITE_CONVEX_URL as string | undefined

export const convexUrl = url ?? ''

export const convex = new ConvexReactClient(convexUrl || 'https://placeholder.convex.cloud', {
  // The placeholder above only exists so the app still renders with a clear
  // message when the deployment URL is missing, instead of throwing on import.
  skipConvexDeploymentUrlCheck: !convexUrl,
})

export function isConvexConfigured(): boolean {
  return convexUrl !== ''
}
