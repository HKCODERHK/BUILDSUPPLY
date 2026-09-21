import type jsPDF from 'jspdf'
import { loadPdfKit, type PdfKit } from './pdfKit'
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
import { formatRate, gstSlabs } from './gst'

// Layout comes from pdfTheme so this matches the estimate and the customer
// ledger exactly — see that file. `logo` must already be loaded (via
// loadLogo) since jsPDF drawing itself is synchronous.
function buildInvoicePdf(
  supplier: Supplier,
  customer: Customer | null,
  invoice: Invoice,
  items: InvoiceItem[],
  logo: LogoImage | null,
  kit: PdfKit,
): jsPDF {
  const { JsPDF, autoTable } = kit
  const doc = new JsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()

  let y = drawDocumentHeader(doc, {
    supplier,
    logo,
    title: 'INVOICE',
    reference: invoice.invoice_no,
    subLines: [formatDate(invoice.created_at)],
  })

  y = drawParties(doc, y, { supplier, customer, site: invoice.site })

  // Lines saved from 035 onwards carry their own percentage, so the bill can
  // print it material-wise — which is what a tax invoice carrying two rates
  // has to do. Older bills have none recorded per line, and keep the single
  // GST row under the totals, exactly as they always printed.
  const slabs = gstSlabs(items)
  const perLine = slabs.length > 0

  autoTable(doc, {
    startY: y,
    head: [perLine ? ['#', 'Particulars', 'Qty', 'Rate', 'GST', 'Amount'] : ['#', 'Particulars', 'Qty', 'Rate', 'Amount']],
    body: items.map((item, i) => {
      const row = [String(i + 1), item.description || '—', String(item.qty), formatINR(item.rate)]
      if (perLine) row.push(item.gst_rate == null ? '—' : formatRate(Number(item.gst_rate)))
      row.push(formatINR(item.amount))
      return row
    }),
    columnStyles: perLine
      ? {
          0: { cellWidth: 10 },
          2: { halign: 'right', cellWidth: 18 },
          3: { halign: 'right', cellWidth: 26 },
          4: { halign: 'right', cellWidth: 16 },
          5: { halign: 'right', cellWidth: 28 },
        }
      : {
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
  if (perLine) {
    for (const slab of slabs) {
      totalRow(`GST ${formatRate(slab.rate)} on ${formatINR(slab.taxable)}`, formatINR(slab.amount))
    }
  } else if (invoice.gst_amount > 0) {
    totalRow('GST', formatINR(invoice.gst_amount))
  }
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
  const [kit, logo] = await Promise.all([loadPdfKit(), loadLogo(supplier.logo_url)])
  buildInvoicePdf(supplier, customer, invoice, items, logo, kit).save(`${invoice.invoice_no}.pdf`)
}

export async function printInvoicePdf(supplier: Supplier, customer: Customer | null, invoice: Invoice, items: InvoiceItem[]) {
  const [kit, logo] = await Promise.all([loadPdfKit(), loadLogo(supplier.logo_url)])
  const doc = buildInvoicePdf(supplier, customer, invoice, items, logo, kit)
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
  const [kit, logo] = await Promise.all([loadPdfKit(), loadLogo(supplier.logo_url)])
  const blob = buildInvoicePdf(supplier, customer, invoice, items, logo, kit).output('blob')
  return new File([blob], `${invoice.invoice_no}.pdf`, { type: 'application/pdf' })
}
