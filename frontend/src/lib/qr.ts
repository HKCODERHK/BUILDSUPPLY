import qrcode from 'qrcode-generator'
import { loadLogo } from './pdfLogo'
import { PATTERN_CIRCLES, PATTERN_GREEN, PATTERN_PATHS, PATTERN_TILE } from './qrPattern'
import { colourFor, initialsOf } from './initials'
import { shade } from './tint'

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

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/**
 * The order QR as a PNG, drawn like the QR screen (OrderLinkShareModal): the
 * code on a white card with the business's logo — or its initials, in the
 * same colour as on screen — over the card's top edge, on a green ground tiled
 * with the building-trade doodles. 1080×1350, a portrait that prints cleanly
 * for the counter and sits well in a WhatsApp chat. English, like every
 * document the app makes. The code itself stays black on white with its quiet
 * zone, so it scans.
 */
export async function orderQrPngFile(opts: {
  url: string
  business: string
  logoUrl: string | null
  initialsKey: string
}): Promise<File> {
  const W = 1080
  const H = 1350
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw the QR.')
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif'

  // The green ground, darker towards the bottom right.
  const ground = ctx.createLinearGradient(0, 0, W * 0.55, H)
  ground.addColorStop(0, PATTERN_GREEN[0])
  ground.addColorStop(0.5, PATTERN_GREEN[1])
  ground.addColorStop(1, PATTERN_GREEN[2])
  ctx.fillStyle = ground
  ctx.fillRect(0, 0, W, H)

  // The doodles, at twice the screen's size so they read on paper.
  const scale = 2
  const tile = PATTERN_TILE * scale
  const paths = PATTERN_PATHS.map((d) => new Path2D(d))
  ctx.save()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)'
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  for (let y = 0; y < H; y += tile) {
    for (let x = 0; x < W; x += tile) {
      ctx.setTransform(scale, 0, 0, scale, x, y)
      paths.forEach((p) => ctx.stroke(p))
      PATTERN_CIRCLES.forEach(([cx, cy, r]) => {
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.stroke()
      })
    }
  }
  ctx.restore()

  // The white card, with the code in it.
  const matrix = qrMatrix(opts.url)
  const total = matrix.length + QR_QUIET_ZONE * 2
  const cell = Math.floor(600 / total)
  const qrPx = cell * total
  const cardW = 760
  const cardX = (W - cardW) / 2
  const cardTop = 260
  const padTop = 130
  const cardH = padTop + qrPx + 70 + 60 + 50 + 60
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.28)'
  ctx.shadowBlur = 60
  ctx.shadowOffsetY = 20
  ctx.fillStyle = '#ffffff'
  roundedRect(ctx, cardX, cardTop, cardW, cardH, 56)
  ctx.fill()
  ctx.restore()

  const qrX = (W - qrPx) / 2
  const qrY = cardTop + padTop
  ctx.fillStyle = '#000000'
  matrix.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) ctx.fillRect(qrX + (c + QR_QUIET_ZONE) * cell, qrY + (r + QR_QUIET_ZONE) * cell, cell, cell)
    }),
  )

  // The logo (or initials) in a white-ringed circle over the card's top edge.
  const R = 110
  const cx = W / 2
  const cy = cardTop
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)'
  ctx.shadowBlur = 30
  ctx.shadowOffsetY = 8
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(cx, cy, R + 12, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  const logo = await loadLogo(opts.logoUrl)
  const img = logo ? await loadImage(logo.dataUrl).catch(() => null) : null
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.clip()
  if (img) {
    // Cover the circle, like object-fit: cover.
    const fit = Math.max((R * 2) / img.width, (R * 2) / img.height)
    const dw = img.width * fit
    const dh = img.height * fit
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2)
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh)
  } else {
    const colour = colourFor(opts.initialsKey)
    const disc = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R)
    disc.addColorStop(0, shade(colour, 0.22))
    disc.addColorStop(0.6, colour)
    disc.addColorStop(1, shade(colour, -0.1))
    ctx.fillStyle = disc
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2)
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 80px ${font}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initialsOf(opts.business), cx, cy + 4)
  }
  ctx.restore()

  // The words under the code.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const nameY = qrY + qrPx + 70
  ctx.fillStyle = '#1F7A45'
  ctx.font = `700 52px ${font}`
  ctx.fillText(opts.business, W / 2, nameY, cardW - 100)
  ctx.fillStyle = '#404040'
  ctx.font = `600 36px ${font}`
  ctx.fillText('Scan to order', W / 2, nameY + 58)
  ctx.fillStyle = '#737373'
  ctx.font = `400 28px ${font}`
  ctx.fillText(opts.url.replace(/^https?:\/\//, ''), W / 2, nameY + 106, cardW - 100)

  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
  ctx.font = `500 30px ${font}`
  ctx.fillText('Point your phone camera at the code to order', W / 2, cardTop + cardH + 80, W - 120)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Could not draw the QR.')
  return new File([blob], 'order-qr.png', { type: 'image/png' })
}
