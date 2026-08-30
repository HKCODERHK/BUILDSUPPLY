// Shared by invoicePdf.ts and quotationPdf.ts — jsPDF needs image bytes up
// front (it can't fetch a URL itself), so the supplier's logo has to be
// downloaded and decoded before either document is drawn.
export interface LogoImage {
  dataUrl: string
  format: 'PNG' | 'JPEG' | 'WEBP'
  width: number
  height: number
}

export async function loadLogo(logoUrl: string | null | undefined): Promise<LogoImage | null> {
  if (!logoUrl) return null
  try {
    const res = await fetch(logoUrl)
    const blob = await res.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
    const format = blob.type.includes('png') ? 'PNG' : blob.type.includes('webp') ? 'WEBP' : 'JPEG'
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => reject(new Error('logo failed to decode'))
      img.src = dataUrl
    })
    return { dataUrl, format, width, height }
  } catch {
    // A broken/unreachable logo shouldn't block the document itself.
    return null
  }
}
