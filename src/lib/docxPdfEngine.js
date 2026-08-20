import fontkit from '@pdf-lib/fontkit'
import { parseAsync, renderDocument } from 'docx-renderer'
import { domToPng, waitUntilLoad } from 'modern-screenshot'
import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFString,
  rgb,
} from 'pdf-lib'
import pdfFonts from 'pdfmake/build/vfs_fonts.js'

const CSS_PIXELS_PER_INCH = 96
const PDF_POINTS_PER_INCH = 72
const PDF_POINTS_PER_CSS_PIXEL = PDF_POINTS_PER_INCH / CSS_PIXELS_PER_INCH
const OUTPUT_DPI = 288
const MAX_PAGE_PIXELS = 32_000_000
const MAX_DOCUMENT_PIXELS = 320_000_000
const MAX_DOCX_BYTES = 80 * 1024 * 1024
const RENDER_OPTIONS = Object.freeze({
  breakPages: true,
  ignoreFonts: false,
  ignoreHeight: false,
  ignoreImageWrap: false,
  ignoreLastRenderedPageBreak: false,
  ignoreTableWrap: false,
  ignoreWidth: false,
  inWrapper: true,
  renderChanges: false,
  renderEndnotes: true,
  renderFooters: true,
  renderFootnotes: true,
  renderHeaders: true,
  useBase64URL: true,
})

function base64Bytes(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function dataUrlBytes(value) {
  const separator = value.indexOf(',')
  if (separator < 0) throw new Error('The rendered Word page did not produce a valid image.')
  return base64Bytes(value.slice(separator + 1))
}

function finiteDimension(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`The Word renderer produced an invalid ${label}.`)
  return value
}

export function planDocxPageRaster(width, height, dpi = OUTPUT_DPI) {
  const safeWidth = finiteDimension(width, 'page width')
  const safeHeight = finiteDimension(height, 'page height')
  const scale = dpi / CSS_PIXELS_PER_INCH
  const pixelWidth = Math.ceil(safeWidth * scale)
  const pixelHeight = Math.ceil(safeHeight * scale)
  const pixels = pixelWidth * pixelHeight
  if (pixels > MAX_PAGE_PIXELS) {
    throw new Error(
      `This Word page would require ${pixels.toLocaleString()} pixels at ${dpi} DPI, above the ` +
      `${MAX_PAGE_PIXELS.toLocaleString()}-pixel fidelity limit. The page was not silently downscaled.`,
    )
  }
  return { scale, pixelWidth, pixelHeight, pixels, dpi }
}

function visibleTextNode(node, pageElement) {
  if (!node.nodeValue || !node.nodeValue.trim()) return false
  const parent = node.parentElement
  if (!parent || !pageElement.contains(parent)) return false
  const hiddenAncestor = parent.closest('script, style, noscript, [hidden], [aria-hidden="true"]')
  if (hiddenAncestor && pageElement.contains(hiddenAncestor)) return false
  const style = getComputedStyle(parent)
  return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0
}

function relativeRectangle(rect, pageRect) {
  const left = Math.max(0, rect.left - pageRect.left)
  const top = Math.max(0, rect.top - pageRect.top)
  const right = Math.min(pageRect.width, rect.right - pageRect.left)
  const bottom = Math.min(pageRect.height, rect.bottom - pageRect.top)
  if (right <= left || bottom <= top) return null
  return { left, top, width: right - left, height: bottom - top }
}

function lineChunksForTextNode(node, pageRect) {
  const range = document.createRange()
  range.selectNodeContents(node)
  const fullRectangles = [...range.getClientRects()]
  if (fullRectangles.length <= 1) {
    const rectangle = fullRectangles[0] && relativeRectangle(fullRectangles[0], pageRect)
    return rectangle ? [{ text: node.nodeValue, rectangle }] : []
  }

  const lines = []
  let offset = 0
  while (offset < node.nodeValue.length) {
    const codePoint = node.nodeValue.codePointAt(offset)
    const length = codePoint > 0xffff ? 2 : 1
    range.setStart(node, offset)
    range.setEnd(node, offset + length)
    const rawRectangle = range.getBoundingClientRect()
    const rectangle = relativeRectangle(rawRectangle, pageRect)
    if (rectangle) {
      const line = lines.findLast((candidate) => Math.abs(candidate.rectangle.top - rectangle.top) <= 1.5)
      const text = node.nodeValue.slice(offset, offset + length)
      if (line) {
        line.text += text
        const right = Math.max(line.rectangle.left + line.rectangle.width, rectangle.left + rectangle.width)
        const bottom = Math.max(line.rectangle.top + line.rectangle.height, rectangle.top + rectangle.height)
        line.rectangle.left = Math.min(line.rectangle.left, rectangle.left)
        line.rectangle.top = Math.min(line.rectangle.top, rectangle.top)
        line.rectangle.width = right - line.rectangle.left
        line.rectangle.height = bottom - line.rectangle.top
      } else {
        lines.push({ text, rectangle: { ...rectangle } })
      }
    }
    offset += length
  }
  return lines
}

function textAndLinksForPage(pageElement) {
  const pageRect = pageElement.getBoundingClientRect()
  const walker = document.createTreeWalker(pageElement, NodeFilter.SHOW_TEXT)
  const textRuns = []
  const links = []
  let node = walker.nextNode()
  while (node) {
    if (visibleTextNode(node, pageElement)) {
      const parent = node.parentElement
      const style = getComputedStyle(parent)
      const href = parent.closest('a[href]')?.href || ''
      const fontSize = Math.max(4, Math.min(200, Number.parseFloat(style.fontSize) || 16))
      for (const chunk of lineChunksForTextNode(node, pageRect)) {
        if (chunk.text.trim()) {
          textRuns.push({ text: chunk.text, rectangle: chunk.rectangle, fontSize })
          if (href) links.push({ href, rectangle: chunk.rectangle })
        }
      }
    }
    node = walker.nextNode()
  }
  return { textRuns, links }
}

function safePdfText(value, supportedCharacters) {
  let result = ''
  for (const character of String(value || '').normalize('NFC')) {
    const codePoint = character.codePointAt(0)
    if (supportedCharacters.has(codePoint)) result += character
    else if (supportedCharacters.has(0xfffd)) result += '\ufffd'
    else if (supportedCharacters.has(0x3f)) result += '?'
  }
  return result
}

function appendLinkAnnotation(pdfDocument, page, { href, rectangle }, pageHeight) {
  if (!/^https?:|^mailto:|^tel:/i.test(href)) return
  const x1 = rectangle.left * PDF_POINTS_PER_CSS_PIXEL
  const x2 = (rectangle.left + rectangle.width) * PDF_POINTS_PER_CSS_PIXEL
  const y1 = pageHeight - (rectangle.top + rectangle.height) * PDF_POINTS_PER_CSS_PIXEL
  const y2 = pageHeight - rectangle.top * PDF_POINTS_PER_CSS_PIXEL
  const annotation = pdfDocument.context.register(pdfDocument.context.obj({
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Link'),
    Rect: [x1, y1, x2, y2],
    Border: [0, 0, 0],
    A: {
      Type: PDFName.of('Action'),
      S: PDFName.of('URI'),
      URI: PDFString.of(href),
    },
  }))
  const key = PDFName.of('Annots')
  let annotations = page.node.lookupMaybe(key, PDFArray)
  if (!annotations) {
    annotations = PDFArray.withContext(pdfDocument.context)
    page.node.set(key, annotations)
  }
  annotations.push(annotation)
}

function createRenderHost() {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  Object.assign(host.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    zIndex: '-2147483648',
    pointerEvents: 'none',
    background: '#ffffff',
  })
  document.body.append(host)
  return host
}

async function pagePng(pageElement, plan) {
  await waitUntilLoad(pageElement, { timeout: 30_000 })
  return domToPng(pageElement, {
    scale: plan.scale,
    backgroundColor: '#ffffff',
    timeout: 30_000,
    maximumCanvasSize: MAX_PAGE_PIXELS,
    style: {
      margin: '0',
      boxShadow: 'none',
      transform: 'none',
    },
  })
}

function setMetadata(pdfDocument, metadata, fallbackTitle) {
  pdfDocument.setTitle(metadata.title || fallbackTitle)
  pdfDocument.setAuthor(metadata.creator || 'Massicot')
  pdfDocument.setSubject(metadata.subject || 'Page-faithful Word conversion')
  pdfDocument.setCreator('Massicot DOCX renderer')
  pdfDocument.setProducer('Massicot / pdf-lib')
  if (metadata.keywords) {
    pdfDocument.setKeywords(String(metadata.keywords).split(/[,;]\s*/).filter(Boolean))
  }
}

function stageError(stage, error) {
  const detail = error instanceof Error ? error.message : String(error || 'Unknown conversion error')
  return new Error(`${stage}: ${detail}`, { cause: error })
}

function normalizeRendererChildren(node, seen = new WeakSet()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return
  seen.add(node)
  if ('type' in node && !Array.isArray(node.children)) node.children = []
  for (const child of node.children || []) normalizeRendererChildren(child, seen)
}

export async function docxToPageFaithfulPdf(file, { title = file.name.replace(/\.[^.]+$/, '') } = {}) {
  if (file.size > MAX_DOCX_BYTES) {
    throw new Error(`This DOCX is ${(file.size / 1024 / 1024).toFixed(1)} MB, above the 80 MB browser-layout limit.`)
  }

  const host = createRenderHost()
  let result
  try {
    try {
      const documentModel = await parseAsync(file, RENDER_OPTIONS)
      normalizeRendererChildren(documentModel.documentPart?.body)
      normalizeRendererChildren(documentModel.footnotesPart?.rootElement)
      normalizeRendererChildren(documentModel.endnotesPart?.rootElement)
      for (const part of documentModel.parts || []) {
        normalizeRendererChildren(part.body)
        normalizeRendererChildren(part.rootElement)
      }
      result = await renderDocument(documentModel, host, host, RENDER_OPTIONS)
    } catch (error) {
      throw stageError('Word pagination failed', error)
    }
    if (!result?.pages?.length) throw new Error('Word pagination failed: the renderer did not produce any pages.')
    await document.fonts?.ready

    const pagePlans = result.pages.map(({ element }) => {
      const rectangle = element.getBoundingClientRect()
      return {
        element,
        width: finiteDimension(rectangle.width, 'page width'),
        height: finiteDimension(rectangle.height, 'page height'),
        plan: planDocxPageRaster(rectangle.width, rectangle.height),
      }
    })
    const totalPixels = pagePlans.reduce((sum, page) => sum + page.plan.pixels, 0)
    if (totalPixels > MAX_DOCUMENT_PIXELS) {
      throw new Error(
        `This document would require ${totalPixels.toLocaleString()} rendered pixels at ${OUTPUT_DPI} DPI, above the ` +
        `${MAX_DOCUMENT_PIXELS.toLocaleString()}-pixel browser fidelity limit. It was not silently downscaled.`,
      )
    }

    const pdfDocument = await PDFDocument.create()
    pdfDocument.registerFontkit(fontkit)
    const searchFont = await pdfDocument.embedFont(base64Bytes(pdfFonts['Roboto-Regular.ttf']), { subset: true })
    const supportedCharacters = new Set(searchFont.getCharacterSet())
    const metadata = result.document.corePropsPart?.props || {}
    setMetadata(pdfDocument, metadata, title)

    for (const pagePlan of pagePlans) {
      const { textRuns, links } = textAndLinksForPage(pagePlan.element)
      let dataUrl
      try {
        dataUrl = await pagePng(pagePlan.element, pagePlan.plan)
      } catch (error) {
        throw stageError(`Page ${pdfDocument.getPageCount() + 1} artwork capture failed`, error)
      }
      const artwork = await pdfDocument.embedPng(dataUrlBytes(dataUrl))
      const pageWidth = pagePlan.width * PDF_POINTS_PER_CSS_PIXEL
      const pageHeight = pagePlan.height * PDF_POINTS_PER_CSS_PIXEL
      const page = pdfDocument.addPage([pageWidth, pageHeight])
      page.drawImage(artwork, { x: 0, y: 0, width: pageWidth, height: pageHeight })

      for (const run of textRuns) {
        const text = safePdfText(run.text, supportedCharacters)
        if (!text) continue
        const fontSize = Math.max(3, run.fontSize * PDF_POINTS_PER_CSS_PIXEL)
        const x = run.rectangle.left * PDF_POINTS_PER_CSS_PIXEL
        const y = Math.max(0, pageHeight - (run.rectangle.top + run.rectangle.height) * PDF_POINTS_PER_CSS_PIXEL)
        try {
          page.drawText(text, {
            x,
            y,
            size: fontSize,
            font: searchFont,
            color: rgb(0, 0, 0),
            opacity: 0,
            lineHeight: fontSize,
          })
        } catch {
          // The visual page is already complete. A malformed or unsupported
          // source glyph must not invalidate the rendered PDF.
        }
      }
      for (const link of links) appendLinkAnnotation(pdfDocument, page, link, pageHeight)
    }

    return new Uint8Array(await pdfDocument.save({ useObjectStreams: true }))
  } finally {
    result?.dispose?.()
    host.remove()
  }
}
