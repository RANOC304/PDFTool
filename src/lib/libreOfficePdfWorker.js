// SPDX-License-Identifier: MIT
// This worker follows the public ZetaJS convertpdf example, with request IDs
// and structured errors added for Massicot's conversion queue.

const { zetajs, zJsModule } = globalThis.zetajsStore
const port = zetajs.mainPort
const css = zetajs.uno.com.sun.star
const context = zetajs.getUnoComponentContext()
const desktop = css.frame.Desktop.create(context)

const hidden = new css.beans.PropertyValue({ Name: 'Hidden', Value: true })
const overwrite = new css.beans.PropertyValue({ Name: 'Overwrite', Value: true })
const pdfExport = new css.beans.PropertyValue({ Name: 'FilterName', Value: 'writer_pdf_Export' })
let activeDocument

port.onmessage = (event) => {
  const request = event.data
  if (request?.cmd !== 'convert-docx-pdf') return

  try {
    const closeable = activeDocument?.queryInterface?.(zetajs.type.interface(css.util.XCloseable))
    if (closeable) activeDocument.close(false)
    activeDocument = desktop.loadComponentFromURL(`file://${request.from}`, '_blank', 0, [hidden])
    if (!activeDocument) throw new Error('LibreOffice could not open this Word document.')
    activeDocument.storeToURL(`file://${request.to}`, [overwrite, pdfExport])
    port.postMessage({ cmd: 'converted-docx-pdf', jobId: request.jobId, from: request.from, to: request.to })
  } catch (error) {
    let message = error instanceof Error ? error.message : String(error)
    try {
      const officeError = zetajs.catchUnoException(error)
      if (officeError?.Message) message = officeError.Message
    } catch {
      // Keep the JavaScript error when the value is not a UNO exception.
    }
    port.postMessage({ cmd: 'conversion-error', jobId: request.jobId, message })
  }
}

port.postMessage({ cmd: 'libreoffice-ready' })

// Keep these live for the lifetime of the office worker.
globalThis.massicotLibreOffice = { zJsModule, desktop, hidden, overwrite, pdfExport }
