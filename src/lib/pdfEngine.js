import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'
import { zipSync } from 'fflate'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

/* ————— Loading & rendering (pdf.js) ————— */

/**
 * Opens a PDF file and returns both the raw bytes (kept for pdf-lib,
 * which needs an untouched copy) and a pdf.js document for rendering.
 * pdf.js transfers its buffer to a worker, so it gets its own copy.
 */
export async function openPdf(file) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
  return { bytes, doc, pageCount: doc.numPages }
}

// intent: 'print' keeps pdf.js off requestAnimationFrame, so rendering
// continues even when the tab is hidden or backgrounded.
export async function renderPageThumb(doc, pageNumber, targetWidth = 320) {
  const page = await doc.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: targetWidth / base.width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  await page.render({ canvasContext: canvas.getContext('2d'), viewport, intent: 'print' }).promise
  const url = canvas.toDataURL('image/jpeg', 0.82)
  canvas.width = 0
  canvas.height = 0
  return url
}

/** Size of page 1 in PDF points (rotation applied). */
export async function firstPageSize(doc) {
  const page = await doc.getPage(1)
  const { width, height } = page.getViewport({ scale: 1 })
  return { width, height }
}

/* ————— Separator ————— */

/** Builds a new PDF containing only the given 0-based page indices, in order. */
export async function extractPages(bytes, indices) {
  const src = await PDFDocument.load(bytes)
  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, indices)
  for (const p of pages) out.addPage(p)
  return out.save()
}

/* ————— Binder (merge) ————— */

export async function mergePdfs(byteList) {
  const out = await PDFDocument.create()
  for (const bytes of byteList) {
    const src = await PDFDocument.load(bytes)
    const pages = await out.copyPages(src, src.getPageIndices())
    for (const p of pages) out.addPage(p)
  }
  return out.save()
}

export async function pdfPageCount(bytes) {
  const doc = await PDFDocument.load(bytes)
  return doc.getPageCount()
}

/* ————— Press (compress by re-photographing pages) ————— */

export async function rasterizePdf(doc, { dpi = 110, quality = 0.7, onProgress } = {}) {
  const out = await PDFDocument.create()
  for (let n = 1; n <= doc.numPages; n++) {
    onProgress?.(n, doc.numPages)
    const page = await doc.getPage(n)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: dpi / 72 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await page.render({ canvasContext: canvas.getContext('2d'), viewport, intent: 'print' }).promise
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality))
    canvas.width = 0
    canvas.height = 0
    const jpg = await out.embedJpg(await blob.arrayBuffer())
    const outPage = out.addPage([base.width, base.height])
    outPage.drawImage(jpg, { x: 0, y: 0, width: base.width, height: base.height })
  }
  return out.save()
}

/* ————— Turntable (rotate) ————— */

/** deltas: array of extra clockwise degrees per page (multiples of 90). */
export async function rotatePages(bytes, deltas) {
  const doc = await PDFDocument.load(bytes)
  doc.getPages().forEach((page, i) => {
    const delta = deltas[i] ?? 0
    if (delta % 360 !== 0) {
      const next = (((page.getRotation().angle + delta) % 360) + 360) % 360
      page.setRotation(degrees(next))
    }
  })
  return doc.save()
}

/* ————— Stamp (watermark) ————— */

export const WATERMARK_COLORS = {
  vermillion: rgb(0.886, 0.267, 0.169),
  ink: rgb(0.11, 0.09, 0.06),
  grey: rgb(0.62, 0.6, 0.55),
}

export async function watermarkPdf(bytes, { text, size, opacity, colorName, placement }) {
  const doc = await PDFDocument.load(bytes)
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const color = WATERMARK_COLORS[colorName] ?? WATERMARK_COLORS.grey
  for (const page of doc.getPages()) {
    const { width: w, height: h } = page.getSize()
    const tw = font.widthOfTextAtSize(text, size)
    if (placement === 'diagonal') {
      const c = Math.SQRT1_2
      page.drawText(text, {
        x: w / 2 - (tw / 2) * c,
        y: h / 2 - (tw / 2) * c,
        size,
        font,
        color,
        opacity,
        rotate: degrees(45),
      })
    } else {
      page.drawText(text, {
        x: (w - tw) / 2,
        y: placement === 'top' ? h - size - 28 : 28,
        size,
        font,
        color,
        opacity,
      })
    }
  }
  return doc.save()
}

/* ————— Composer (reorder / duplicate / remove) ————— */

/** order: 0-based source indices, duplicates allowed. */
export async function reorderPages(bytes, order) {
  const src = await PDFDocument.load(bytes)
  const out = await PDFDocument.create()
  for (const idx of order) {
    const [page] = await out.copyPages(src, [idx])
    out.addPage(page)
  }
  return out.save()
}

/* ————— Guillotine (split) ————— */

export async function splitPdf(bytes, chunkSize) {
  const src = await PDFDocument.load(bytes)
  const total = src.getPageCount()
  const files = []
  let part = 1
  for (let start = 0; start < total; start += chunkSize, part++) {
    const end = Math.min(start + chunkSize, total)
    const out = await PDFDocument.create()
    const pages = await out.copyPages(
      src,
      Array.from({ length: end - start }, (_, k) => start + k),
    )
    for (const p of pages) out.addPage(p)
    const label = end - start === 1 ? `page ${start + 1}` : `pages ${start + 1}-${end}`
    files.push({
      name: `part-${String(part).padStart(2, '0')} (${label}).pdf`,
      bytes: await out.save(),
    })
  }
  return files
}

/* ————— Album (images -> PDF) ————— */

const A4 = [595.28, 841.89]

export async function imagesToPdf(images, { pageMode = 'fit' } = {}) {
  const out = await PDFDocument.create()
  for (const img of images) {
    let embedded
    const isPng = /png$/i.test(img.type) || /\.png$/i.test(img.name)
    const isJpg = /jpe?g$/i.test(img.type) || /\.jpe?g$/i.test(img.name)
    if (isPng) {
      embedded = await out.embedPng(img.bytes)
    } else if (isJpg) {
      embedded = await out.embedJpg(img.bytes)
    } else {
      // webp / gif / bmp… — let the browser decode, re-encode as PNG
      const bitmap = await createImageBitmap(new Blob([img.bytes]))
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      canvas.getContext('2d').drawImage(bitmap, 0, 0)
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'))
      canvas.width = 0
      canvas.height = 0
      embedded = await out.embedPng(await blob.arrayBuffer())
    }
    if (pageMode === 'a4') {
      const page = out.addPage([...A4])
      const margin = 36
      const scale = Math.min(
        (A4[0] - margin * 2) / embedded.width,
        (A4[1] - margin * 2) / embedded.height,
      )
      const w = embedded.width * scale
      const h = embedded.height * scale
      page.drawImage(embedded, { x: (A4[0] - w) / 2, y: (A4[1] - h) / 2, width: w, height: h })
    } else {
      const page = out.addPage([embedded.width, embedded.height])
      page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height })
    }
  }
  return out.save()
}

/* ————— Darkroom (PDF -> images) ————— */

export async function pdfToImages(doc, { format = 'png', scale = 2, onProgress } = {}) {
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png'
  const files = []
  for (let n = 1; n <= doc.numPages; n++) {
    onProgress?.(n, doc.numPages)
    const page = await doc.getPage(n)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await page.render({ canvasContext: canvas.getContext('2d'), viewport, intent: 'print' }).promise
    const blob = await new Promise((r) => canvas.toBlob(r, mime, 0.9))
    canvas.width = 0
    canvas.height = 0
    files.push({
      name: `page-${String(n).padStart(2, '0')}.${format === 'jpeg' ? 'jpg' : 'png'}`,
      bytes: new Uint8Array(await blob.arrayBuffer()),
    })
  }
  return files
}

/* ————— Typesetter (page numbers) ————— */

export async function addPageNumbers(
  bytes,
  { position = 'bottom-center', format = 'n', start = 1, size = 11, margin = 28 } = {},
) {
  const doc = await PDFDocument.load(bytes)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const total = doc.getPageCount()
  doc.getPages().forEach((page, i) => {
    const n = start + i
    const label =
      format === 'n-of-total'
        ? `${n} / ${start + total - 1}`
        : format === 'page-n'
          ? `Page ${n}`
          : `${n}`
    const { width: w, height: h } = page.getSize()
    const tw = font.widthOfTextAtSize(label, size)
    const x = position.endsWith('left')
      ? margin
      : position.endsWith('right')
        ? w - margin - tw
        : (w - tw) / 2
    const y = position.startsWith('top') ? h - margin - size : margin
    page.drawText(label, { x, y, size, font, color: rgb(0.11, 0.09, 0.06) })
  })
  return doc.save()
}

/* ————— Scribe (extract text) ————— */

export async function extractText(doc) {
  const pages = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    let text = ''
    for (const item of content.items) {
      text += item.str
      if (item.hasEOL) text += '\n'
    }
    pages.push(text.trim())
  }
  return pages
}

/* ————— Ledger (metadata) ————— */

export async function readPdfMeta(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  return {
    title: doc.getTitle() ?? '',
    author: doc.getAuthor() ?? '',
    subject: doc.getSubject() ?? '',
    keywords: doc.getKeywords() ?? '',
    creator: doc.getCreator() ?? '',
    producer: doc.getProducer() ?? '',
  }
}

export async function writePdfMeta(bytes, meta) {
  const doc = await PDFDocument.load(bytes)
  doc.setTitle(meta.title)
  doc.setAuthor(meta.author)
  doc.setSubject(meta.subject)
  doc.setKeywords(
    meta.keywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean),
  )
  doc.setModificationDate(new Date())
  return doc.save()
}

/* ————— Shared helpers ————— */

export function zipFiles(files) {
  const entries = {}
  for (const f of files) {
    entries[f.name] = f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes)
  }
  return zipSync(entries)
}

export function downloadBytes(bytes, filename, mime = 'application/pdf') {
  const blob = new Blob([bytes], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** "1-3, 7, 12-14" -> Set of 0-based indices, clamped to [1, total]. */
export function parseRanges(text, total) {
  const set = new Set()
  for (const part of String(text).split(/[,;]+/)) {
    const t = part.trim()
    if (!t) continue
    const range = t.match(/^(\d+)\s*[-–—]\s*(\d+)$/)
    if (range) {
      let a = Number(range[1])
      let b = Number(range[2])
      if (a > b) [a, b] = [b, a]
      for (let n = Math.max(1, a); n <= Math.min(total, b); n++) set.add(n - 1)
    } else if (/^\d+$/.test(t)) {
      const n = Number(t)
      if (n >= 1 && n <= total) set.add(n - 1)
    }
  }
  return set
}

/** Set of 0-based indices -> "1-3, 7, 12-14" */
export function formatRanges(selected) {
  const idx = [...selected].sort((a, b) => a - b)
  const parts = []
  let i = 0
  while (i < idx.length) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++
    parts.push(i === j ? `${idx[i] + 1}` : `${idx[i] + 1}-${idx[j] + 1}`)
    i = j + 1
  }
  return parts.join(', ')
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function baseName(filename) {
  return filename.replace(/\.pdf$/i, '')
}

export function isPdfFile(file) {
  return file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name))
}

export function isImageFile(file) {
  return file && (/^image\//.test(file.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name))
}
