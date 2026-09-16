import type jsPDF from 'jspdf'
import { loadPdfKit, type PdfKit } from './pdfKit'
import type { Customer, Supplier, PaymentMode } from './database.types'
import { loadLogo, type LogoImage } from './pdfLogo'
import { amountInWords } from './amountInWords'
import {
  PDF_MARGIN_X,
  INK,
  GREEN,
  RED,
  GREY,
  LINE,
  TINT_GREEN,
  TINT_GREY,
  TINT_RED,
  formatINR,
  formatDate,
  tableStyles,
  drawDocumentHeader,
  drawParties,
  drawPageFooter,
} from './pdfTheme'

export interface LedgerEntry {
  date: string
  // 'Opening' is the customer's old udhaar from before BuildSupply.
  type: 'Invoice' | 'Payment' | 'Opening'
  ref: string
  mode: PaymentMode | null
  debit: number
  credit: number
  balance: number
}

export interface LedgerInput {
  entries: LedgerEntry[]
  openingBalance: number
  dateFrom?: string
  dateTo?: string
  // Set only when the statement is narrowed to one site — a customer can
  // have several running, so the customer's own "usual site" would be
  // misleading here.
  site?: string
}

function formatDayInput(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Shares its header, party blocks, table styling and footer with the invoice
// and estimate (see pdfTheme), so a customer gets one recognisable document
// design whether it arrives as a bill or as a payment reminder.
function buildCustomerLedgerPdf(
  supplier: Supplier,
  customer: Customer,
  input: LedgerInput,
  logo: LogoImage | null,
  kit: PdfKit,
): jsPDF {
  const { JsPDF, autoTable } = kit
  const doc = new JsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  const totalBilled = input.entries.reduce((sum, e) => sum + e.debit, 0)
  const totalPaid = input.entries.reduce((sum, e) => sum + e.credit, 0)
  const closing = input.entries.length ? input.entries[input.entries.length - 1].balance : input.openingBalance

  // How the money actually came in — the whole point of this document for
  // the customer: proof of what they paid and through which mode.
  const byMode = new Map<string, { amount: number; count: number }>()
  input.entries
    .filter((e) => e.type === 'Payment')
    .forEach((e) => {
      const key = e.mode ?? 'Other'
      const cur = byMode.get(key) ?? { amount: 0, count: 0 }
      cur.amount += e.credit
      cur.count += 1
      byMode.set(key, cur)
    })

  const period =
    input.dateFrom || input.dateTo
      ? `${input.dateFrom ? formatDayInput(input.dateFrom) : 'Beginning'}  to  ${input.dateTo ? formatDayInput(input.dateTo) : 'Today'}`
      : 'All transactions to date'

  let y = drawDocumentHeader(doc, {
    supplier,
    logo,
    title: 'CUSTOMER LEDGER',
    subLines: [period, `Generated ${formatDate(new Date().toISOString())}`],
  })

  y = drawParties(doc, y, {
    supplier,
    customer,
    toLabel: 'STATEMENT FOR',
    site: input.site ?? 'All sites',
  })

  // ---- Summary boxes -------------------------------------------------
  const gap = 4
  const boxW = (pageWidth - PDF_MARGIN_X * 2 - gap * 2) / 3
  const boxH = 20

  function summaryBox(x: number, label: string, value: string, color: [number, number, number], fill: [number, number, number]) {
    doc.setFillColor(...fill)
    doc.roundedRect(x, y, boxW, boxH, 2, 2, 'F')
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GREY)
    doc.text(label.toUpperCase(), x + 4, y + 7)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...color)
    doc.text(value, x + 4, y + 15)
  }

  summaryBox(PDF_MARGIN_X, 'Total Billed', formatINR(totalBilled), INK, TINT_GREY)
  summaryBox(PDF_MARGIN_X + boxW + gap, 'Total Paid', formatINR(totalPaid), GREEN, TINT_GREEN)
  summaryBox(
    PDF_MARGIN_X + (boxW + gap) * 2,
    closing > 0 ? 'Balance Due' : 'Balance',
    formatINR(Math.abs(closing)),
    closing > 0 ? RED : GREEN,
    closing > 0 ? TINT_RED : TINT_GREEN,
  )
  y += boxH + 9

  const footerCaption = `${supplier.business_name}  ·  Ledger for ${customer.name}`

  // ---- Payment mode breakdown ---------------------------------------
  if (byMode.size > 0) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...INK)
    doc.text('How payments were made', PDF_MARGIN_X, y)

    autoTable(doc, {
      startY: y + 4,
      head: [['Payment mode', 'No. of payments', 'Amount paid']],
      body: Array.from(byMode.entries())
        .sort((a, b) => b[1].amount - a[1].amount)
        .map(([mode, v]) => [mode, String(v.count), formatINR(v.amount)]),
      foot: [['Total received', String(input.entries.filter((e) => e.type === 'Payment').length), formatINR(totalPaid)]],
      columnStyles: {
        1: { halign: 'right', cellWidth: 38 },
        2: { halign: 'right', cellWidth: 42 },
      },
      theme: 'grid',
      ...tableStyles,
      didDrawPage: () => drawPageFooter(doc, footerCaption),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 10
  }

  // ---- Transaction table --------------------------------------------
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...INK)
  doc.text('Full transaction history', PDF_MARGIN_X, y)

  const body: string[][] = []
  // "Brought forward", not "opening balance": that name belongs to the
  // customer's old udhaar, which can appear as a row of its own below.
  if (input.openingBalance !== 0) {
    body.push(['—', 'Balance brought forward', '', '', '', formatINR(input.openingBalance)])
  }
  input.entries.forEach((e) => {
    body.push([
      formatDate(e.date),
      e.type === 'Opening'
        ? 'Opening balance'
        : e.type === 'Invoice'
          ? `Bill ${e.ref}`
          : e.ref
            ? `Payment against ${e.ref}`
            : 'Advance received',
      e.mode ?? '',
      e.debit ? formatINR(e.debit) : '',
      e.credit ? formatINR(e.credit) : '',
      formatINR(e.balance),
    ])
  })

  autoTable(doc, {
    startY: y + 4,
    head: [['Date', 'Particulars', 'Mode', 'Bill Amount', 'Paid', 'Balance']],
    body,
    foot: [['', 'Closing balance', '', formatINR(totalBilled), formatINR(totalPaid), formatINR(closing)]],
    columnStyles: {
      0: { cellWidth: 22 },
      2: { cellWidth: 22 },
      3: { halign: 'right', cellWidth: 26 },
      4: { halign: 'right', cellWidth: 26 },
      5: { halign: 'right', cellWidth: 28 },
    },
    // Money in stays green, money owed stays neutral — a customer scanning
    // this should be able to spot their own payments instantly.
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 4 && data.cell.raw) {
        data.cell.styles.textColor = GREEN
        data.cell.styles.fontStyle = 'bold'
      }
    },
    theme: 'grid',
    ...tableStyles,
    styles: { fontSize: 9 },
    didDrawPage: () => drawPageFooter(doc, footerCaption),
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 10

  // Keep the closing summary intact rather than splitting it across pages.
  if (y > pageHeight - 45) {
    doc.addPage()
    y = 20
  }

  // ---- Closing statement ---------------------------------------------
  const closingFill: [number, number, number] = closing > 0 ? TINT_RED : TINT_GREEN
  doc.setFillColor(...closingFill)
  doc.roundedRect(PDF_MARGIN_X, y, pageWidth - PDF_MARGIN_X * 2, 22, 2, 2, 'F')
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GREY)
  doc.text(closing > 0 ? 'AMOUNT STILL PAYABLE' : 'NOTHING PENDING', PDF_MARGIN_X + 5, y + 8)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...(closing > 0 ? RED : GREEN))
  doc.text(formatINR(Math.abs(closing)), PDF_MARGIN_X + 5, y + 17)

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(...GREY)
  doc.text(amountInWords(closing), pageWidth - PDF_MARGIN_X - 5, y + 17, { align: 'right' })
  y += 30

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GREY)
  doc.text(
    'This statement is generated from our records. Please contact us if anything does not match your own.',
    PDF_MARGIN_X,
    y,
  )
  doc.setDrawColor(...LINE)

  return doc
}

function ledgerFileName(customer: Customer) {
  return `ledger-${customer.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`
}

export async function downloadCustomerLedgerPdf(supplier: Supplier, customer: Customer, input: LedgerInput) {
  const [kit, logo] = await Promise.all([loadPdfKit(), loadLogo(supplier.logo_url)])
  buildCustomerLedgerPdf(supplier, customer, input, logo, kit).save(ledgerFileName(customer))
}

// Used when sending a payment reminder over WhatsApp, so the customer gets
// the full record rather than just a number in a message.
export async function customerLedgerPdfFile(supplier: Supplier, customer: Customer, input: LedgerInput): Promise<File> {
  const [kit, logo] = await Promise.all([loadPdfKit(), loadLogo(supplier.logo_url)])
  const blob = buildCustomerLedgerPdf(supplier, customer, input, logo, kit).output('blob')
  return new File([blob], ledgerFileName(customer), { type: 'application/pdf' })
}
