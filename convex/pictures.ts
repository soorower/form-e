import { ConvexError, v } from 'convex/values'
import { mutation } from './_generated/server'
import { requireBuilder } from './access'

/**
 * Pictures shown in choice-experiment tables (a photo per road condition,
 * say). They live in Convex file storage rather than inside the survey
 * document: eight photos would take most of a document's 1 MB and ride along
 * with every survey list and every autosave. The survey keeps each picture's
 * URL and storage id; see `LevelPicture` in src/lib/questionnaire/types.ts.
 */

/** Largest picture accepted. The editor downscales photos well below this first. */
const MAX_PICTURE_BYTES = 5 * 1024 * 1024

/** Raster formats only: an SVG can carry script. */
const PICTURE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

/** A one-time URL the builder's browser posts one picture to. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireBuilder(ctx)
    return await ctx.storage.generateUploadUrl()
  },
})

/**
 * Checks an uploaded file is a picture of sensible size and returns the URL
 * the survey stores. Anything else is deleted again, so the upload URL cannot
 * be used to park arbitrary files.
 */
export const confirmUpload = mutation({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, { storageId }) => {
    await requireBuilder(ctx)
    const file = await ctx.db.system.get(storageId)
    if (!file) throw new ConvexError('The picture did not arrive. Try uploading it again.')
    if (!PICTURE_TYPES.has(file.contentType ?? '') || file.size > MAX_PICTURE_BYTES) {
      await ctx.storage.delete(storageId)
      throw new ConvexError('Only pictures up to 5 MB can be used (JPEG, PNG, WebP, GIF).')
    }
    const url = await ctx.storage.getUrl(storageId)
    if (!url) throw new ConvexError('The picture could not be stored. Try uploading it again.')
    return { storageId, url }
  },
})
