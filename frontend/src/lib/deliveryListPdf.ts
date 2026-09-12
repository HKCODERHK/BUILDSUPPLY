import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Supplier } from './database.types'
import { loadLogo, type LogoImage } from './pdfLogo'
import { PDF_MARGIN_X, GREY, formatDate, tableStyles, drawDocumentHeader, drawPageFooter } from './pdfTheme'

// The morning's trips, written out by hand every day until now: one sheet for
// the driver with each stop's bill, customer, phone, site and materials, and a
// box to tick as each load comes off. No amounts — it goes to the driver.

export interface DeliveryStop {
  invoiceNo: string
  customer: string
  phone: string | null
  site: string | null
  items: { description: string; qty: number; unit: string | null }[]
}

function itemLine(item: DeliveryStop['items'][number]) {
  return `${Number(item.qty).toLocaleString('en-IN')} ${item.unit ?? ''} ${item.description}`.replace(/\s+/g, ' ').trim()
}

function buildDeliveryListPdf(supplier: Supplier, stops: DeliveryStop[], logo: LogoImage | null): jsPDF {
  const doc = new jsPDF()
  const today = new Date().toISOString()

  const y = drawDocumentHeader(doc, {
    supplier,
    logo,
    title: 'DELIVERY LIST',
    subLines: [formatDate(today), `${stops.length} ${stops.length === 1 ? 'delivery' : 'deliveries'}`],
  })

  const doneColumn = 4
  autoTable(doc, {
    startY: y,
    head: [['#', 'Bill / Customer', 'Site', 'Materials', 'Done']],
    body: stops.map((s, i) => [
      String(i + 1),
      [s.invoiceNo, s.customer, s.phone].filter(Boolean).join('\n'),
      s.site || '—',
      s.items.map(itemLine).join('\n') || '—',
      '',
    ]),
    ...tableStyles,
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 46 },
      2: { cellWidth: 42 },
      [doneColumn]: { cellWidth: 14 },
    },
    // An empty box in the Done column, for the driver's pen.
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== doneColumn) return
      const size = 5
      doc.setDrawColor(...GREY)
      doc.setLineWidth(0.3)
      doc.rect(data.cell.x + (data.cell.width - size) / 2, data.cell.y + 3, size, size)
    },
    didDrawPage: () => drawPageFooter(doc, `${supplier.business_name}  ·  Delivery list`),
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const endY = (doc as any).lastAutoTable.finalY + 10
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(9)
  doc.setTextColor(...GREY)
  doc.text('Tick each stop when the load is off. Call the customer before reaching the site.', PDF_MARGIN_X, endY)

  return doc
}

function fileName() {
  return `Delivery-List-${new Date().toLocaleDateString('en-CA')}.pdf`
}

export async function downloadDeliveryListPdf(supplier: Supplier, stops: DeliveryStop[]) {
  const logo = await loadLogo(supplier.logo_url)
  buildDeliveryListPdf(supplier, stops, logo).save(fileName())
}

export async function deliveryListPdfFile(supplier: Supplier, stops: DeliveryStop[]): Promise<File> {
  const logo = await loadLogo(supplier.logo_url)
  const blob = buildDeliveryListPdf(supplier, stops, logo).output('blob')
  return new File([blob], fileName(), { type: 'application/pdf' })
}
