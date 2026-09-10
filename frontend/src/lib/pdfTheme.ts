import type jsPDF from 'jspdf'
import type { UserOptions } from 'jspdf-autotable'
import type { Customer, Supplier } from './database.types'
import type { LogoImage } from './pdfLogo'

// Single source of truth for how every BuildSupply PDF looks — invoice,
// estimate and customer ledger all draw their header, party blocks, tables
// and footer from here, so a customer sees one consistent document design
// whether it arrived as a bill or as a payment reminder.

export const PDF_MARGIN_X = 14

export const INK: [number, number, number] = [10, 36, 39]
export const GREEN: [number, number, number] = [25, 138, 69]
export const RED: [number, number, number] = [180, 60, 20]
export const GREY: [number, number, number] = [120, 130, 130]
export const MUTED: [number, number, number] = [90, 100, 100]
export const LINE: [number, number, number] = [225, 230, 230]
export const TINT_GREEN: [number, number, number] = [232, 245, 236]
export const TINT_GREY: [number, number, number] = [245, 247, 247]
export const TINT_RED: [number, number, number] = [253, 240, 235]

export function formatINR(n: number) {
  return `Rs. ${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Shared table styling so the line-items table on a bill and the transaction
// table on a ledger read as the same document family.
export const tableStyles: Pick<UserOptions, 'headStyles' | 'footStyles' | 'styles' | 'margin'> = {
  headStyles: { fillColor: TINT_GREEN, textColor: [20, 60, 40], fontStyle: 'bold' },
  footStyles: { fillColor: TINT_GREY, textColor: INK, fontStyle: 'bold' },
  styles: { fontSize: 9.5 },
  margin: { left: PDF_MARGIN_X, right: PDF_MARGIN_X },
}

/**
 * Shrinks a font size until the text fits `maxWidth`, so a long business
 * name and a long document title can never overlap in the header.
 */
function fitFontSize(doc: jsPDF, text: string, maxWidth: number, startSize: number, minSize: number): number {
  let size = startSize
  while (size > minSize) {
    doc.setFontSize(size)
    if (doc.getTextWidth(text) <= maxWidth) break
    size -= 0.5
  }
  doc.setFontSize(size)
  return size
}

/**
 * Business identity on the left, document type on the right.
 * Returns the y position to continue drawing from.
 */
export function drawDocumentHeader(
  doc: jsPDF,
  opts: { supplier: Supplier; logo: LogoImage | null; title: string; reference?: string; subLines?: string[] },
): number {
  const pageWidth = doc.internal.pageSize.getWidth()
  const y = 20

  const logoBox = 16
  let nameX = PDF_MARGIN_X
  if (opts.logo) {
    const scale = Math.min(logoBox / opts.logo.width, logoBox / opts.logo.height)
    doc.addImage(opts.logo.dataUrl, opts.logo.format, PDF_MARGIN_X, y - 10, opts.logo.width * scale, opts.logo.height * scale)
    nameX = PDF_MARGIN_X + logoBox + 4
  }

  // Split the header width between the business name and the title, giving
  // each only what it needs and shrinking whichever would otherwise collide.
  const contentRight = pageWidth - PDF_MARGIN_X
  const available = contentRight - nameX
  doc.setFont('helvetica', 'bold')
  fitFontSize(doc, opts.supplier.business_name, available * 0.56, 18, 10)
  const nameWidth = doc.getTextWidth(opts.supplier.business_name)

  doc.setTextColor(...INK)
  doc.text(opts.supplier.business_name, nameX, y)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  doc.text('BUILDING MATERIAL SUPPLIER', nameX, y + 5)

  doc.setFont('helvetica', 'bold')
  fitFontSize(doc, opts.title, available - nameWidth - 6, 16, 8)
  doc.setTextColor(...INK)
  doc.text(opts.title, contentRight, y, { align: 'right' })

  let rightY = y + 6
  if (opts.reference) {
    doc.setFontSize(11)
    doc.setTextColor(...GREEN)
    doc.text(opts.reference, pageWidth - PDF_MARGIN_X, rightY, { align: 'right' })
    rightY += 5
  }
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GREY)
  for (const line of opts.subLines ?? []) {
    doc.text(line, pageWidth - PDF_MARGIN_X, rightY, { align: 'right' })
    rightY += 5
  }

  const dividerY = Math.max(y + 22, rightY + 1)
  doc.setDrawColor(...LINE)
  doc.line(PDF_MARGIN_X, dividerY, pageWidth - PDF_MARGIN_X, dividerY)
  return dividerY + 10
}

/**
 * FROM (supplier) / TO (customer) blocks side by side.
 * Returns the y position to continue drawing from.
 */
export function drawParties(
  doc: jsPDF,
  y: number,
  opts: {
    supplier: Supplier
    // Only what the block prints, so a receipt can pass the name, address and
    // phone it captured without fetching a whole customer row.
    customer: Pick<Customer, 'name' | 'address' | 'phone'> | null
    toLabel?: string
    site?: string | null
  },
): number {
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFontSize(8)
  doc.setTextColor(140, 140, 140)
  doc.text('FROM', PDF_MARGIN_X, y)
  doc.text(opts.toLabel ?? 'TO', pageWidth / 2, y)
  y += 5

  doc.setFontSize(10.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 20)
  doc.text(opts.supplier.business_name, PDF_MARGIN_X, y)
  doc.text(opts.customer?.name ?? 'Walk-in customer', pageWidth / 2, y)
  y += 5

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  const fromLines = [
    opts.supplier.address,
    opts.supplier.gst_number ? `GST: ${opts.supplier.gst_number}` : null,
    opts.supplier.phone,
  ].filter((v): v is string => !!v)
  const toLines = [
    opts.customer?.address,
    opts.site ? `Site: ${opts.site}` : null,
    opts.customer?.phone,
  ].filter((v): v is string => !!v)

  const rows = Math.max(fromLines.length, toLines.length, 1)
  for (let i = 0; i < rows; i++) {
    if (fromLines[i]) doc.text(fromLines[i], PDF_MARGIN_X, y + i * 4.5)
    if (toLines[i]) doc.text(toLines[i], pageWidth / 2, y + i * 4.5)
  }
  return y + rows * 4.5 + 8
}

/** Business name and page number along the bottom of every page. */
export function drawPageFooter(doc: jsPDF, caption: string) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GREY)
  doc.text(caption, PDF_MARGIN_X, pageHeight - 8)
  doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - PDF_MARGIN_X, pageHeight - 8, { align: 'right' })
}
