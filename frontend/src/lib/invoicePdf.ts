import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Invoice, InvoiceItem, Customer, Supplier } from './database.types'
import { loadLogo, type LogoImage } from './pdfLogo'
import {
  PDF_MARGIN_X,
  INK,
  GREEN,
  RED,
  GREY,
  LINE,
  formatINR,
  formatDate,
  tableStyles,
  drawDocumentHeader,
  drawParties,
  drawPageFooter,
} from './pdfTheme'

// Layout comes from pdfTheme so this matches the estimate and the customer
// ledger exactly — see that file. `logo` must already be loaded (via
// loadLogo) since jsPDF drawing itself is synchronous.
function buildInvoicePdf(
  supplier: Supplier,
  customer: Customer | null,
  invoice: Invoice,
  items: InvoiceItem[],
  logo: LogoImage | null,
): jsPDF {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()

  let y = drawDocumentHeader(doc, {
    supplier,
    logo,
    title: 'INVOICE',
    reference: invoice.invoice_no,
    subLines: [formatDate(invoice.created_at)],
  })

  y = drawParties(doc, y, { supplier, customer, site: invoice.site })

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
    didDrawPage: () => drawPageFooter(doc, `${supplier.business_name}  ·  ${invoice.invoice_no}`),
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

  totalRow('Subtotal', formatINR(invoice.subtotal))
  if (invoice.gst_amount > 0) totalRow('GST', formatINR(invoice.gst_amount))
  if (invoice.transport_labour_charge > 0) totalRow('Transport + Labour', formatINR(invoice.transport_labour_charge))
  doc.setDrawColor(...LINE)
  doc.line(labelX, y - 3, totalsX, y - 3)
  totalRow('Grand Total', formatINR(invoice.total), { bold: true, color: INK })
  totalRow('Paid', formatINR(invoice.paid), { color: GREEN })
  const remaining = Math.max(0, invoice.total - invoice.paid)
  if (remaining > 0) totalRow('Remaining', formatINR(remaining), { bold: true, color: RED })

  y += 10
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(9.5)
  doc.setTextColor(...GREY)
  doc.text('Thank you for your business!', PDF_MARGIN_X, y)

  return doc
}

export async function downloadInvoicePdf(supplier: Supplier, customer: Customer | null, invoice: Invoice, items: InvoiceItem[]) {
  const logo = await loadLogo(supplier.logo_url)
  buildInvoicePdf(supplier, customer, invoice, items, logo).save(`${invoice.invoice_no}.pdf`)
}

export async function printInvoicePdf(supplier: Supplier, customer: Customer | null, invoice: Invoice, items: InvoiceItem[]) {
  const logo = await loadLogo(supplier.logo_url)
  const doc = buildInvoicePdf(supplier, customer, invoice, items, logo)
  const url = doc.output('bloburl')
  window.open(url, '_blank', 'noopener,noreferrer')
}

// Used for WhatsApp sharing — the file itself (not a save/print side effect)
// so the caller can hand it to navigator.share().
export async function invoicePdfFile(
  supplier: Supplier,
  customer: Customer | null,
  invoice: Invoice,
  items: InvoiceItem[],
): Promise<File> {
  const logo = await loadLogo(supplier.logo_url)
  const blob = buildInvoicePdf(supplier, customer, invoice, items, logo).output('blob')
  return new File([blob], `${invoice.invoice_no}.pdf`, { type: 'application/pdf' })
}
