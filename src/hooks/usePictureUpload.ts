import { useMutation } from 'convex/react'
import { useCallback } from 'react'
import { api } from '../../convex/_generated/api'
import { preparePicture } from '#/lib/image'

/**
 * Uploads a picture for a choice table to Convex file storage and returns
 * where it is served from. Photos are downscaled first (`preparePicture`).
 * Uses whichever Convex client the page sits under, so the admin area's
 * editor uploads on the admin session.
 */
export function usePictureUpload() {
  const generateUploadUrl = useMutation(api.pictures.generateUploadUrl)
  const confirmUpload = useMutation(api.pictures.confirmUpload)
  return useCallback(
    async (source: Blob): Promise<{ url: string; storageId: string }> => {
      const picture = await preparePicture(source)
      const target = await generateUploadUrl()
      const response = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': picture.type },
        body: picture,
      })
      if (!response.ok) throw new Error('The picture could not be uploaded. Check the connection and try again.')
      const { storageId } = (await response.json()) as { storageId: string }
      return await confirmUpload({ storageId: storageId as never })
    },
    [confirmUpload, generateUploadUrl],
  )
}
