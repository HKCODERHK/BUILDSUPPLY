import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Supplier } from './database.types'
import { loadLogo } from './pdfLogo'
import {
  PDF_MARGIN_X,
  INK,
  GREY,
  formatINR,
  formatDate,
  tableStyles,
  drawDocumentHeader,
  drawPageFooter,
} from './pdfTheme'

export interface ReportFilters {
  dateFrom?: string
  dateTo?: string
  customerName?: string
  site?: string
}

export interface ReportSpec {
  supplier: Supplier
  title: string
  filters: ReportFilters
  head: string[]
  rows: (string | number)[][]
  /** Column indexes holding money — formatted as rupees, right-aligned and totalled. */
  moneyColumns?: number[]
  fileName: string
}

function formatDayInput(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Every report uses the same header, table styling and footer as the invoice
// and the customer ledger (see pdfTheme) — one recognisable document design
// across the whole app. Reports carry no FROM/TO block: they're the
// supplier's own records, not something addressed to a customer.
async function buildReportPdf(spec: ReportSpec): Promise<jsPDF> {
  const doc = new jsPDF()
  const logo = await loadLogo(spec.supplier.logo_url)
  const money = new Set(spec.moneyColumns ?? [])

  const period =
    spec.filters.dateFrom || spec.filters.dateTo
      ? `${spec.filters.dateFrom ? formatDayInput(spec.filters.dateFrom) : 'Beginning'}  to  ${
          spec.filters.dateTo ? formatDayInput(spec.filters.dateTo) : 'Today'
        }`
      : 'All dates'

  let y = drawDocumentHeader(doc, {
    supplier: spec.supplier,
    logo,
    title: spec.title.toUpperCase(),
    subLines: [period, `Generated ${formatDate(new Date().toISOString())}`],
  })

  // Only show the filter line when a filter is actually narrowing things,
  // so an unfiltered report stays clean.
  const applied = [
    spec.filters.customerName ? `Customer: ${spec.filters.customerName}` : null,
    spec.filters.site ? `Site: ${spec.filters.site}` : null,
  ].filter((v): v is string => !!v)
  if (applied.length) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GREY)
    doc.text(applied.join('   ·   '), PDF_MARGIN_X, y)
    y += 7
  }

  if (spec.rows.length === 0) {
    doc.setFontSize(10)
    doc.setTextColor(...GREY)
    doc.text('No records match these filters.', PDF_MARGIN_X, y + 4)
    drawPageFooter(doc, `${spec.supplier.business_name}  ·  ${spec.title}`)
    return doc
  }

  const body = spec.rows.map((row) =>
    row.map((cell, i) => (money.has(i) ? (cell === '' || cell == null ? '' : formatINR(Number(cell))) : String(cell))),
  )

  // A totals row only makes sense for money columns — everything else is
  // left blank rather than showing a meaningless sum.
  const foot =
    money.size > 0
      ? [
          spec.head.map((_, i) => {
            if (i === 0) return `${spec.rows.length} record${spec.rows.length === 1 ? '' : 's'}`
            if (!money.has(i)) return ''
            return formatINR(spec.rows.reduce((sum, r) => sum + (Number(r[i]) || 0), 0))
          }),
        ]
      : undefined

  const columnStyles: Record<number, { halign: 'right' }> = {}
  money.forEach((i) => {
    columnStyles[i] = { halign: 'right' }
  })

  autoTable(doc, {
    startY: y,
    head: [spec.head],
    body,
    foot,
    columnStyles,
    ...tableStyles,
    didDrawPage: () => drawPageFooter(doc, `${spec.supplier.business_name}  ·  ${spec.title}`),
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable.finalY + 10
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(...INK)
  doc.text('Generated from BuildSupply records.', PDF_MARGIN_X, finalY)

  return doc
}

export async function downloadReportPdf(spec: ReportSpec) {
  const doc = await buildReportPdf(spec)
  doc.save(spec.fileName)
}

/** The same report as a File, for sending on WhatsApp — see shareDocument. */
export async function reportPdfFile(spec: ReportSpec): Promise<File> {
  const doc = await buildReportPdf(spec)
  return new File([doc.output('blob')], spec.fileName, { type: 'application/pdf' })
}
