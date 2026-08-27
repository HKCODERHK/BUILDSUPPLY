import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

export function exportPdf(title: string, head: string[], rows: (string | number)[][], filename: string) {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text(title, 14, 16)
  autoTable(doc, { head: [head], body: rows.map((r) => r.map(String)), startY: 22 })
  doc.save(filename)
}

export function exportExcel(sheetName: string, head: string[], rows: (string | number)[][], filename: string) {
  const worksheet = XLSX.utils.aoa_to_sheet([head, ...rows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  XLSX.writeFile(workbook, filename)
}
