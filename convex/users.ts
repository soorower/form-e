import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { emailSettings } from './emailSettings'
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

/**
 * What the sign-in page may offer: codes by email (sign-up verification and
 * "Forgot password?") only once the deployment can send them.
 */
export const authOptions = query({
  args: {},
  handler: async () => ({ emailCodes: emailSettings() !== null }),
})

/**
 * Sets the signed-in account's name, once, after a password sign-up proved
 * its address. It never replaces a name already there, so a sign-up that
 * landed on someone else's existing account cannot rename it.
 */
export const setMyName = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const user = await currentUser(ctx)
    const cleaned = name.trim().slice(0, 80)
    if (!user || !cleaned || user.name?.trim()) return
    await ctx.db.patch(user._id, { name: cleaned })
  },
})
