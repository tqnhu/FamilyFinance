/** Longest side of a stored receipt photo. Big enough to read the small print, small enough to keep storage cheap. */
export const MAX_SIDE = 1600
export const JPEG_QUALITY = 0.8

/** Scales (w, h) down so the longest side is at most `max`; never scales up. */
export function fitWithin(w: number, h: number, max = MAX_SIDE): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) }
}

/** Reads a photo from the camera or gallery, corrects its rotation, shrinks it and returns a JPEG. */
export async function compressToJpeg(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a photo.')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('This photo could not be read. Try a JPEG or PNG.')
  }
  const { w, h } = fitWithin(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff' // PNGs with transparency would otherwise turn black
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY))
  if (!blob) throw new Error('This photo could not be processed.')
  return blob
}
