// Triggers a browser download of an in-memory File — used by the WhatsApp
// share fallback on both invoices and quotations, when native file sharing
// isn't available and the supplier needs to attach the PDF by hand instead.
export function downloadFile(file: File) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  URL.revokeObjectURL(url)
}
