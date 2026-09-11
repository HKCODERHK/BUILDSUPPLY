import qrcode from 'qrcode-generator'

// QR codes for UPI (migration 029). The library only works out which squares
// are dark; drawing is ours — an SVG on screen (components/QrCode) and a canvas
// for the image sent on WhatsApp — always black on white, since a scanner
// needs the contrast whatever the app's theme is.

/** The squares every QR needs clear around it, in modules. */
export const QR_QUIET_ZONE = 4

/** Which squares are dark, row by row. Medium error correction: sturdy on a phone screen. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  return Array.from({ length: n }, (_, row) => Array.from({ length: n }, (_, col) => qr.isDark(row, col)))
}

/**
 * The QR as a PNG, with the business name and amount above it and a caption
 * below — what goes through the share sheet as a real image.
 */
export async function qrPngFile(opts: { text: string; lines: string[]; caption: string; filename: string }): Promise<File> {
  const matrix = qrMatrix(opts.text)
  const cell = 10
  const qrPx = (matrix.length + QR_QUIET_ZONE * 2) * cell
  const pad = 32
  const lineHeight = 40
  const width = qrPx + pad * 2
  const height = pad + opts.lines.length * lineHeight + qrPx + 56 + pad

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw the QR.')
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif'

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#111111'
  ctx.textAlign = 'center'
  opts.lines.forEach((line, i) => {
    ctx.font = `${i === 0 ? 600 : 700} ${i === 0 ? 24 : 32}px ${font}`
    ctx.fillText(line, width / 2, pad + 28 + i * lineHeight, width - pad * 2)
  })

  const top = pad + opts.lines.length * lineHeight
  matrix.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) ctx.fillRect(pad + (c + QR_QUIET_ZONE) * cell, top + (r + QR_QUIET_ZONE) * cell, cell, cell)
    }),
  )

  ctx.fillStyle = '#555555'
  ctx.font = `400 20px ${font}`
  ctx.fillText(opts.caption, width / 2, top + qrPx + 34, width - pad * 2)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Could not draw the QR.')
  return new File([blob], opts.filename, { type: 'image/png' })
}
