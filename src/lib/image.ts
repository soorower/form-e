/** Loads an image from a URL (a data URL, an object URL, or a web address). */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image failed to load'))
    image.src = src
  })
}

/** The image drawn at most `edge` pixels on its longer side, on `background` when given. */
export function drawScaled(
  image: HTMLImageElement,
  width: number,
  height: number,
  edge: number,
  background?: string,
): HTMLCanvasElement | null {
  const scale = Math.min(1, edge / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d')
  if (!context) return null
  if (background) {
    context.fillStyle = background
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}

/**
 * Longest side of a picture shown in a choice table. It is shown at most
 * 288 px wide, so 800 px stays sharp on a retina tablet and small to download.
 */
const MAX_PICTURE_EDGE = 800
const KEEP_PICTURE_UNDER_BYTES = 250_000
const KEPT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

/**
 * A picture ready to upload for a choice table. Field tablets load every
 * picture of a survey, often over mobile data, so a 1280 px, 700 KB photo is
 * brought down to 800 px as a JPEG (about 150 KB). A picture already small
 * enough is sent as it is.
 */
export async function preparePicture(source: Blob): Promise<Blob> {
  const url = URL.createObjectURL(source)
  try {
    const image = await loadImage(url).catch(() => {
      throw new Error('This file is not a picture that can be shown (use JPEG, PNG, or WebP).')
    })
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (
      KEPT_TYPES.has(source.type) &&
      Math.max(width, height) <= MAX_PICTURE_EDGE &&
      source.size <= KEEP_PICTURE_UNDER_BYTES
    ) {
      return source
    }
    const canvas = drawScaled(image, width, height, MAX_PICTURE_EDGE, '#ffffff')
    const blob = canvas
      ? await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
      : null
    if (!blob) throw new Error('The picture could not be prepared for upload.')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}
