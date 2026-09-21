import { query } from './_generated/server'
import { accessFor, canBuild, currentUser, displayName, isApproved } from './access'

/**
 * The signed-in user with what they may do, or null when the request carries
 * no valid session. `approved` is what gates the surveys and dashboard pages;
 * `groups` lists every group they are in, approved or not, so the waiting
 * page can say which one is pending.
 */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx)
    if (!user) return null
    const access = await accessFor(ctx, user)
    const groups = [...access.groups, ...access.pending].map((group) => ({
      id: group.id,
      name: group.name,
      approved: group.approved,
    }))
    return {
      id: user._id,
      name: user.name ?? null,
      email: user.email ?? null,
      image: user.image ?? null,
      /** admin, builder, or surveyor (see convex/access.ts). */
      role: access.role,
      /** The name the team sees; a surveyor's responses are recorded under it. */
      displayName: displayName(user),
      /** The code the admin gave a surveyor, e.g. S01. */
      code: user.surveyorCode ?? null,
      /** The admin's decision on this account; admins are always approved. */
      status: access.admin ? ('approved' as const) : access.status,
      /** Approved by the admin (any role): may open the app. */
      approved: isApproved(access),
      /** Admin or approved builder: may create and edit surveys and see answers. */
      canBuild: canBuild(access),
      groups,
    }
  },
})
