import { getAuthUserId } from '@convex-dev/auth/server'
import { query } from './_generated/server'

/** The signed-in user, or null when the request carries no valid session. */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (userId === null) return null
    const user = await ctx.db.get(userId)
    if (!user) return null
    return {
      id: user._id,
      name: user.name ?? null,
      email: user.email ?? null,
      image: user.image ?? null,
    }
  },
})
