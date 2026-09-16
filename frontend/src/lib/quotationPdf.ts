import type jsPDF from 'jspdf'
import { loadPdfKit, type PdfKit } from './pdfKit'
import type { Quotation, QuotationItem, Customer, Supplier } from './database.types'
import { loadLogo, type LogoImage } from './pdfLogo'
import {
  PDF_MARGIN_X,
  INK,
  GREY,
  LINE,
  formatINR,
  formatDate,
  tableStyles,
  drawDocumentHeader,
  drawParties,
  drawPageFooter,
} from './pdfTheme'

// Same layout as the invoice (see pdfTheme), headed "ESTIMATE" and with no
// Paid/Remaining rows — an estimate hasn't been billed, so nothing is paid
// against it yet.
function buildQuotationPdf(
  supplier: Supplier,
  customer: Customer | null,
  quotation: Quotation,
  items: QuotationItem[],
  logo: LogoImage | null,
  kit: PdfKit,
): jsPDF {
  const { JsPDF, autoTable } = kit
  const doc = new JsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()

  let y = drawDocumentHeader(doc, {
    supplier,
    logo,
    title: 'ESTIMATE',
    reference: quotation.quote_no,
    subLines: [formatDate(quotation.created_at)],
  })

  y = drawParties(doc, y, { supplier, customer, site: quotation.site })

  autoTable(doc, {
    startY: y,
    head: [['#', 'Particulars', 'Qty', 'Rate', 'Amount']],
    body: items.map((item, i) => [
      String(i + 1),
      item.description || '—',
      String(item.qty),
      formatINR(item.rate),
      formatINR(item.amount),
    ]),
    columnStyles: {
      0: { cellWidth: 10 },
      2: { halign: 'right', cellWidth: 20 },
      3: { halign: 'right', cellWidth: 30 },
      4: { halign: 'right', cellWidth: 30 },
    },
    ...tableStyles,
    didDrawPage: () => drawPageFooter(doc, `${supplier.business_name}  ·  ${quotation.quote_no}`),
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 10

  const totalsX = pageWidth - PDF_MARGIN_X
  const labelX = totalsX - 55
  function totalRow(label: string, value: string, opts?: { bold?: boolean; color?: [number, number, number] }) {
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal')
    doc.setFontSize(opts?.bold ? 11 : 9.5)
    doc.setTextColor(...(opts?.color ?? [60, 70, 70]))
    doc.text(label, labelX, y)
    doc.text(value, totalsX, y, { align: 'right' })
    y += opts?.bold ? 7 : 6
  }

  totalRow('Subtotal', formatINR(quotation.subtotal))
  if (quotation.gst_amount > 0) totalRow('GST', formatINR(quotation.gst_amount))
  if (quotation.transport_labour_charge > 0) totalRow('Transport + Labour', formatINR(quotation.transport_labour_charge))
  doc.setDrawColor(...LINE)
  doc.line(labelX, y - 3, totalsX, y - 3)
  totalRow('Grand Total', formatINR(quotation.total), { bold: true, color: INK })

  y += 10
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(9.5)
  doc.setTextColor(...GREY)
  doc.text('This is an estimate, not a tax invoice. Prices may change.', PDF_MARGIN_X, y)

  return doc
}

export async function downloadQuotationPdf(supplier: Supplier, customer: Customer | null, quotation: Quotation, items: QuotationItem[]) {
  const [kit, logo] = await Promise.all([loadPdfKit(), loadLogo(supplier.logo_url)])
  buildQuotationPdf(supplier, customer, quotation, items, logo, kit).save(`${quotation.quote_no}.pdf`)
}

export async function printQuotationPdf(supplier: Supplier, customer: Customer | null, quotation: Quotation, items: QuotationItem[]) {
  const [kit, logo] = await Promise.all([loadPdfKit(), loadLogo(supplier.logo_url)])
  const doc = buildQuotationPdf(supplier, customer, quotation, items, logo, kit)
  const url = doc.output('bloburl')
  window.open(url, '_blank', 'noopener,noreferrer')
}

export async function quotationPdfFile(
  supplier: Supplier,
  customer: Customer | null,
  quotation: Quotation,
  items: QuotationItem[],
): Promise<File> {
  const [kit, logo] = await Promise.all([loadPdfKit(), loadLogo(supplier.logo_url)])
  const blob = buildQuotationPdf(supplier, customer, quotation, items, logo, kit).output('blob')
  return new File([blob], `${quotation.quote_no}.pdf`, { type: 'application/pdf' })
}
