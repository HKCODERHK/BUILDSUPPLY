/**
 * Shrinks a photo on the phone before it is uploaded (migration 042's cover
 * and product photos), so a 6 MB camera picture becomes a ~150 KB WebP that
 * fits the logos bucket's 2 MB limit and keeps the free tier's storage for
 * years. Falls back to JPEG on a browser that cannot write WebP.
 */
export async function shrinkImage(file: File, maxWidth: number, maxHeight: number): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height)
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This phone cannot prepare the picture.')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.82))
  let blob = await toBlob('image/webp')
  let type = 'image/webp'
  if (!blob || blob.type !== 'image/webp') {
    blob = await toBlob('image/jpeg')
    type = 'image/jpeg'
  }
  if (!blob) throw new Error('This phone cannot prepare the picture.')
  return new File([blob], type === 'image/webp' ? 'photo.webp' : 'photo.jpg', { type })
}
