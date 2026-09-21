import { ConvexReactClient } from 'convex/react'
import { convexUrl } from './client'

/**
 * A second client for the admin area. Auth tokens are attached per client,
 * so the admin session rides on this connection while the app's session
 * stays on the main one, and signing in to either leaves the other alone.
 */
export const adminConvex = new ConvexReactClient(
  convexUrl || 'https://placeholder.convex.cloud',
  { skipConvexDeploymentUrlCheck: !convexUrl },
)
