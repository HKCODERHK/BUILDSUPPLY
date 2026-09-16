import type jsPDF from 'jspdf'
import { loadPdfKit, type PdfKit } from './pdfKit'
import type { Material, Supplier } from './database.types'
import { loadLogo, type LogoImage } from './pdfLogo'
import {
  PDF_MARGIN_X,
  GREY,
  formatINR,
  formatDate,
  tableStyles,
  drawDocumentHeader,
  drawPageFooter,
} from './pdfTheme'

// "Aaj cement ka rate kya hai?" arrives on WhatsApp a dozen times a day and
// gets typed out by hand a dozen times a day. This is the same answer as a
// proper document, on the supplier's own letterhead, in one tap.
//
// Deliberately shows no stock quantities — this sheet goes to customers, and
// how much a supplier is holding is nobody else's business.
function buildRateListPdf(supplier: Supplier, materials: Material[], logo: LogoImage | null, kit: PdfKit): jsPDF {
  const { JsPDF, autoTable } = kit
  const doc = new JsPDF()
  const today = new Date().toISOString()

  const y = drawDocumentHeader(doc, {
    supplier,
    logo,
    title: 'RATE LIST',
    subLines: [formatDate(today)],
  })

  autoTable(doc, {
    startY: y,
    head: [['#', 'Material', 'Unit', 'Rate']],
    body: materials.map((m, i) => [
      String(i + 1),
      m.name,
      m.unit_label || m.per_label || '—',
      `${formatINR(m.rate)}${m.per_label ? ` ${m.per_label}` : ''}`,
    ]),
    columnStyles: {
      0: { cellWidth: 10 },
      3: { halign: 'right', cellWidth: 45 },
    },
    ...tableStyles,
    didDrawPage: () => drawPageFooter(doc, `${supplier.business_name}  ·  Rate list`),
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const endY = (doc as any).lastAutoTable.finalY + 10

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(9)
  doc.setTextColor(...GREY)
  doc.text('Rates are for today and may change. GST and transport extra where applicable.', PDF_MARGIN_X, endY)

  return doc
}

/** Materials worth putting on a customer-facing sheet — anything priced. */
export function rateListMaterials(materials: Material[]): Material[] {
  return materials.filter((m) => Number(m.rate) > 0).sort((a, b) => a.name.localeCompare(b.name))
}

function fileName(supplier: Supplier) {
  const date = new Date().toLocaleDateString('en-CA')
  return `Rate-List-${supplier.business_name.replace(/[^a-zA-Z0-9]+/g, '-')}-${date}.pdf`
}

export async function downloadRateListPdf(supplier: Supplier, materials: Material[]) {
  const [kit, logo] = await Promise.all([loadPdfKit(), loadLogo(supplier.logo_url)])
  buildRateListPdf(supplier, materials, logo, kit).save(fileName(supplier))
}

export async function rateListPdfFile(supplier: Supplier, materials: Material[]): Promise<File> {
  const [kit, logo] = await Promise.all([loadPdfKit(), loadLogo(supplier.logo_url)])
  const blob = buildRateListPdf(supplier, materials, logo, kit).output('blob')
  return new File([blob], fileName(supplier), { type: 'application/pdf' })
}
