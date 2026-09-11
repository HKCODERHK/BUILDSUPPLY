import { useMemo } from 'react'
import { QR_QUIET_ZONE, qrMatrix } from '@/lib/qr'

/** A QR code, black on white whatever the theme, with its quiet zone built in. */
export function QrCode({ text, size = 240, label }: { text: string; size?: number; label: string }) {
  const { total, path } = useMemo(() => {
    const matrix = qrMatrix(text)
    const d = matrix
      .flatMap((row, r) => row.map((dark, c) => (dark ? `M${c + QR_QUIET_ZONE} ${r + QR_QUIET_ZONE}h1v1h-1z` : '')))
      .join('')
    return { total: matrix.length + QR_QUIET_ZONE * 2, path: d }
  }, [text])

  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className="max-w-full"
    >
      <rect width={total} height={total} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  )
}
