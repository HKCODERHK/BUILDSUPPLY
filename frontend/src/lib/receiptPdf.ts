import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Customer, PaymentMode, Supplier } from './database.types'
import { loadLogo, type LogoImage } from './pdfLogo'
import {
  PDF_MARGIN_X,
  INK,
  GREEN,
  RED,
  MUTED,
  TINT_GREEN,
  formatINR,
  formatDate,
  tableStyles,
  drawDocumentHeader,
  drawParties,
  drawPageFooter,
} from './pdfTheme'

// Written proof of money changing hands, sent the moment it does. "Maine to
// paise de diye the" is the argument this ends: the customer holds the
// amount, the mode, the bills it cleared and what is still owed, on the
// supplier's letterhead, timed to the minute.

export interface ReceiptInput {
  amount: number
  mode: PaymentMode
  /** What the customer still owes after this payment, across every bill. */
  balance: number
  /** The bills the money went onto. */
  appliedTo: { invoice_no: string; amount: number }[]
  /** What this payment kept as advance, beyond everything they owed. */
  advance?: number
  /** Everything the customer now holds in advance. */
  advanceBalance?: number
}

type ReceiptCustomer = Pick<Customer, 'name' | 'address' | 'phone'>

function buildReceiptPdf(
  supplier: Supplier,
  customer: ReceiptCustomer,
  input: ReceiptInput,
  receivedAt: Date,
  logo: LogoImage | null,
): jsPDF {
  const doc = new jsPDF()
  const right = doc.internal.pageSize.getWidth() - PDF_MARGIN_X
  const footer = `${supplier.business_name}  ·  Payment receipt`

  let y = drawDocumentHeader(doc, {
    supplier,
    logo,
    title: 'PAYMENT RECEIPT',
    subLines: [
      formatDate(receivedAt.toISOString()),
      receivedAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }),
    ],
  })
  y = drawParties(doc, y, { supplier, customer, toLabel: 'RECEIVED FROM' })

  // The one figure this document exists for, large enough to read off the
  // preview before the customer even opens it.
  const boxHeight = 24
  doc.setFillColor(...TINT_GREEN)
  doc.roundedRect(PDF_MARGIN_X, y, right - PDF_MARGIN_X, boxHeight, 2, 2, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text('AMOUNT RECEIVED', PDF_MARGIN_X + 6, y + 8)
  doc.text('MODE', right - 6, y + 8, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...GREEN)
  doc.text(formatINR(input.amount), PDF_MARGIN_X + 6, y + 18)
  doc.setFontSize(12)
  doc.setTextColor(...INK)
  doc.text(input.mode, right - 6, y + 18, { align: 'right' })
  y += boxHeight + 10

  // One line per bill (a split payment can touch the same bill twice), and
  // the part kept for later as a line of its own.
  const byBill = new Map<string, number>()
  for (const a of input.appliedTo) byBill.set(a.invoice_no, (byBill.get(a.invoice_no) ?? 0) + a.amount)
  const rows = Array.from(byBill.entries()).map(([no, amount]) => [no, formatINR(amount)])
  if ((input.advance ?? 0) > 0) rows.push(['Kept as advance', formatINR(input.advance ?? 0)])

  if (rows.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Against bill', { content: 'Amount', styles: { halign: 'right' } }]],
      body: rows,
      columnStyles: { 1: { halign: 'right', cellWidth: 45 } },
      ...tableStyles,
      didDrawPage: () => drawPageFooter(doc, footer),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 10
  } else {
    drawPageFooter(doc, footer)
  }

  // Same rule as the WhatsApp message that carries this, so the two never
  // disagree about whether anything is still owed.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  if (input.balance > 0) {
    doc.setTextColor(...RED)
    doc.text(`Balance still due: ${formatINR(input.balance)}`, PDF_MARGIN_X, y)
  } else if ((input.advanceBalance ?? 0) > 0) {
    doc.setTextColor(...GREEN)
    doc.text(`Nothing due. Advance with us: ${formatINR(input.advanceBalance ?? 0)}`, PDF_MARGIN_X, y)
  } else {
    doc.setTextColor(...GREEN)
    doc.text('Account fully settled. Thank you.', PDF_MARGIN_X, y)
  }

  return doc
}

function fileName(customer: ReceiptCustomer, receivedAt: Date) {
  const date = receivedAt.toLocaleDateString('en-CA')
  return `Receipt-${customer.name.replace(/[^a-zA-Z0-9]+/g, '-')}-${date}.pdf`
}

export async function receiptPdfFile(supplier: Supplier, customer: ReceiptCustomer, input: ReceiptInput): Promise<File> {
  const receivedAt = new Date()
  const logo = await loadLogo(supplier.logo_url)
  const blob = buildReceiptPdf(supplier, customer, input, receivedAt, logo).output('blob')
  return new File([blob], fileName(customer, receivedAt), { type: 'application/pdf' })
}
