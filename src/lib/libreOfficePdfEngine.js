// SPDX-License-Identifier: MIT
// ZetaJS is the MIT-licensed bridge to LibreOffice Technology compiled to
// WebAssembly. Only the runtime is downloaded; document bytes stay in the
// browser's in-memory filesystem.

import zetaJsUrl from 'zetajs/zeta.js?url'
import libreOfficeWorkerUrl from './libreOfficePdfWorker.js?worker&url'

const WASM_BASE_URL = 'https://cdn.zetaoffice.net/zetaoffice_latest/'
const STARTUP_TIMEOUT_MS = 240_000
const CONVERSION_TIMEOUT_MS = 180_000
const MAX_DOCX_BYTES = 120 * 1024 * 1024

let runtimePromise
let runtime
const pendingJobs = new Map()

function ensureCanvas() {
  let canvas = document.getElementById('qtcanvas')
  if (canvas) return canvas
  canvas = document.createElement('canvas')
  canvas.id = 'qtcanvas'
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, {
    display: 'none',
    width: '1px',
    height: '1px',
  })
  document.body.append(canvas)
  return canvas
}

function withTimeout(promise, timeout, message) {
  let timer
  const timed = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeout)
  })
  return Promise.race([promise, timed]).finally(() => clearTimeout(timer))
}

function removeVirtualFile(fs, path) {
  try {
    fs.unlink(path)
  } catch {
    // The file may not exist after a failed import/export.
  }
}

function handleRuntimeMessage(activeRuntime, message) {
  if (message?.cmd === 'libreoffice-ready') {
    activeRuntime.resolveReady(activeRuntime)
    return
  }
  const job = pendingJobs.get(message?.jobId)
  if (!job) return
  pendingJobs.delete(message.jobId)

  if (message.cmd === 'conversion-error') {
    removeVirtualFile(activeRuntime.fs, job.from)
    removeVirtualFile(activeRuntime.fs, job.to)
    job.reject(new Error(`LibreOffice conversion failed: ${message.message || 'unknown office error'}`))
    return
  }
  if (message.cmd !== 'converted-docx-pdf') return

  try {
    const bytes = activeRuntime.fs.readFile(job.to)
    job.resolve(new Uint8Array(bytes))
  } catch (error) {
    job.reject(new Error(`LibreOffice did not produce a readable PDF: ${error.message}`, { cause: error }))
  } finally {
    removeVirtualFile(activeRuntime.fs, job.from)
    removeVirtualFile(activeRuntime.fs, job.to)
  }
}

async function startRuntime() {
  if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
    throw new Error(
      'Exact Word rendering requires cross-origin isolation. Serve Massicot with the configured ' +
      'COOP/COEP headers over localhost or HTTPS, then reload the page.',
    )
  }

  const canvas = ensureCanvas()
  const bootstrapSource = `
    globalThis.Module.zetajs.then(async (zetajs) => {
      globalThis.zetajsStore = { zetajs, zJsModule: globalThis.Module };
      await import(${JSON.stringify(new URL(libreOfficeWorkerUrl, location.href).href)});
    });
  `
  const bootstrapUrl = `data:text/javascript;charset=UTF-8,${encodeURIComponent(bootstrapSource)}`
  const officeModule = {
    canvas,
    uno_scripts: [new URL(zetaJsUrl, location.href).href, bootstrapUrl],
    locateFile(path, prefix) {
      return `${prefix || WASM_BASE_URL}${path}`
    },
  }
  officeModule.mainScriptUrlOrBlob = new Blob(
    [`importScripts(${JSON.stringify(new URL('soffice.js', WASM_BASE_URL).href)});`],
    { type: 'text/javascript' },
  )
  globalThis.Module = officeModule

  const script = document.createElement('script')
  script.src = new URL('soffice.js', WASM_BASE_URL).href
  script.crossOrigin = 'anonymous'

  const started = new Promise((resolve, reject) => {
    script.onerror = () => reject(new Error('The LibreOffice WebAssembly runtime could not be downloaded.'))
    script.onload = async () => {
      try {
        const port = await officeModule.uno_main
        const activeRuntime = {
          fs: globalThis.FS,
          port,
          resolveReady: resolve,
          rejectReady: reject,
        }
        port.onmessage = (event) => handleRuntimeMessage(activeRuntime, event.data)
      } catch (error) {
        reject(new Error(`LibreOffice WebAssembly could not start: ${error.message}`, { cause: error }))
      }
    }
  })
  document.body.append(script)
  runtime = await withTimeout(
    started,
    STARTUP_TIMEOUT_MS,
    'LibreOffice WebAssembly did not finish starting within four minutes.',
  )
  return runtime
}

function getRuntime() {
  if (!runtimePromise) {
    runtimePromise = startRuntime().catch((error) => {
      runtimePromise = undefined
      throw error
    })
  }
  return runtimePromise
}

export async function docxToLibreOfficePdf(file) {
  if (file.size > MAX_DOCX_BYTES) {
    throw new Error(`This DOCX is ${(file.size / 1024 / 1024).toFixed(1)} MB, above the 120 MB local office limit.`)
  }

  // Embedded webviews can disable SharedArrayBuffer even when the host sends
  // the correct headers. Keep those environments functional with the audited
  // page renderer; normal isolated browsers use Writer's native exporter.
  if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
    const { docxToPageFaithfulPdf } = await import('./docxPdfEngine.js')
    return docxToPageFaithfulPdf(file)
  }

  const activeRuntime = await getRuntime()
  const jobId = crypto.randomUUID()
  const from = `/tmp/massicot-${jobId}.docx`
  const to = `/tmp/massicot-${jobId}.pdf`
  activeRuntime.fs.writeFile(from, new Uint8Array(await file.arrayBuffer()))

  const conversion = new Promise((resolve, reject) => {
    pendingJobs.set(jobId, { resolve, reject, from, to })
    activeRuntime.port.postMessage({ cmd: 'convert-docx-pdf', jobId, from, to })
  })
  try {
    return await withTimeout(
      conversion,
      CONVERSION_TIMEOUT_MS,
      'LibreOffice did not finish this Word-to-PDF conversion within three minutes.',
    )
  } catch (error) {
    pendingJobs.delete(jobId)
    removeVirtualFile(activeRuntime.fs, from)
    removeVirtualFile(activeRuntime.fs, to)
    throw error
  }
}
