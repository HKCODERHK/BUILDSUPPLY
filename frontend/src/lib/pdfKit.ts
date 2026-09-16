import type JsPDFClass from 'jspdf'
import type AutoTable from 'jspdf-autotable'

// jsPDF and its table plugin are the heaviest thing in the app, and only
// needed at the moment a bill, estimate, statement, receipt, rate list, report
// or delivery list is made. So they are fetched then — once, and shared — not
// every time the app opens. Every PDF builder's exported function was already
// async (it waits for the logo), so none of their callers changed.
// A signed-in supplier's phone fetches them early in the background anyway
// (lib/screens), and the service worker keeps them for offline use.

export interface PdfKit {
  JsPDF: typeof JsPDFClass
  autoTable: typeof AutoTable
}

let kit: Promise<PdfKit> | null = null

export function loadPdfKit(): Promise<PdfKit> {
  kit ??= Promise.all([import('jspdf'), import('jspdf-autotable')])
    .then(([pdf, table]) => ({ JsPDF: pdf.default, autoTable: table.default }))
    .catch((err) => {
      // No signal just now: let the next tap try again.
      kit = null
      throw err
    })
  return kit
}

/** Fetch them ahead of time, quietly — a failure here is simply retried at the tap. */
export function warmPdfKit(): Promise<void> {
  return loadPdfKit().then(
    () => undefined,
    () => undefined,
  )
}
