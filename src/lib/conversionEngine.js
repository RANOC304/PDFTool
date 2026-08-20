import { bytesToBase64, packageOriginalFile } from './binaryEngine.js'
import { csvCell, csvRowsToRecords, jsonRows, parseCsv } from './dataEngine.js'
import { semanticPdfPagesToDocx, semanticPdfPagesToXlsx, structuredRowsToXlsx } from './officeEngine.js'
import { nativeHtmlDocumentToPdf, nativeSvgToPdf, nativeTableToPdf, nativeTextToPdf } from './nativePdfWriter.js'
import { pdfToSemanticPages } from './pdfSemanticEngine.js'
import { extractText, imagesToPdf, openPdf, pdfToImages, zipFiles } from './pdfEngine.js'
import { assertPsdFidelityLimits, flattenPsdLayers } from './psdPolicy.js'

const MIME = {
  csv: 'text/csv;charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  html: 'text/html;charset=utf-8',
  jpg: 'image/jpeg',
  json: 'application/json;charset=utf-8',
  pdf: 'application/pdf',
  png: 'image/png',
  txt: 'text/plain;charset=utf-8',
  webp: 'image/webp',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
}

const encoder = new TextEncoder()

function externalCssResource(css) {
  for (const match of String(css || '').matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
    const value = match[2].trim()
    if (value && !value.startsWith('data:') && !value.startsWith('#')) return value
  }
  for (const match of String(css || '').matchAll(/@import\s+(?:url\(\s*)?['"]?([^'"\s);]+)/gi)) {
    const value = match[1].trim()
    if (value && !value.startsWith('data:')) return value
  }
  return null
}

function stem(name) {
  return name.replace(/\.[^.]+$/, '')
}

function output(bytes, file, target, extension = target, mime = MIME[target]) {
  return {
    bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
    filename: `${stem(file.name)} (converted).${extension}`,
    mime,
  }
}

function validateFile(file, conversion) {
  if (conversion.source === 'any') return
  const accepted = conversion.accept
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.startsWith('.'))
  const lower = file.name.toLowerCase()
  if (!accepted.some((extension) => lower.endsWith(extension))) {
    throw new Error(`This route needs a ${conversion.sourceLabel} file.`)
  }
}

function canvasBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The browser could not encode this image.'))),
      mime,
      quality,
    )
  })
}

function canvasWithBackground(source, background = null) {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const context = canvas.getContext('2d')
  if (background) {
    context.fillStyle = background
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  context.drawImage(source, 0, 0)
  return canvas
}

async function imageFileToCanvas(file) {
  let renderSource = file
  if (/\.svg$/i.test(file.name) || file.type === 'image/svg+xml') {
    renderSource = new Blob([await sanitizeSvg(file)], { type: 'image/svg+xml' })
  }
  const url = URL.createObjectURL(renderSource)
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('This image could not be decoded by the browser.'))
      element.src = url
    })
    const sourceWidth = image.naturalWidth || image.width || 1600
    const sourceHeight = image.naturalHeight || image.height || 900
    const maxPixels = 64_000_000
    if (sourceWidth * sourceHeight > maxPixels) {
      throw new Error(
        'This image exceeds the 64-megapixel safe browser limit. It was not resized or changed.',
      )
    }
    const canvas = document.createElement('canvas')
    canvas.width = sourceWidth
    canvas.height = sourceHeight
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function sanitizeSvg(file) {
  const source = new DOMParser().parseFromString(await file.text(), 'image/svg+xml')
  if (source.querySelector('parsererror')) throw new Error('This SVG is not valid XML.')
  const dynamic = source.querySelector('script, foreignObject, animate, animateMotion, animateTransform, set')
  if (dynamic) {
    throw new Error(`This SVG contains <${dynamic.tagName}> content that cannot remain authentic in a static PDF or raster image. Export a static SVG first.`)
  }
  source.querySelectorAll('*').forEach((node) => {
    for (const attribute of [...node.attributes]) {
      if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name)
    }
  })
  for (const node of source.querySelectorAll('image, use, feImage, [src], link[rel~="stylesheet"]')) {
    const value = node.getAttribute('href') || node.getAttribute('xlink:href') || node.getAttribute('src')
    if (value && !value.startsWith('data:') && !value.startsWith('#')) {
      throw new Error(
        `The SVG references an external resource (${value.slice(0, 90)}). Embed it as a data URI so the artwork cannot render incomplete.`,
      )
    }
  }
  const css = [...source.querySelectorAll('style')].map((node) => node.textContent || '').join('\n')
  const externalUrl = externalCssResource(css)
  if (externalUrl) {
    throw new Error(`The SVG stylesheet references an external resource (${externalUrl.slice(0, 90)}). Embed it before converting.`)
  }
  return new XMLSerializer().serializeToString(source)
}

async function rasterBytes(canvas, target) {
  const mime = MIME[target]
  const needsWhite = target === 'jpg'
  const working = needsWhite ? canvasWithBackground(canvas, '#ffffff') : canvas
  const blob = await canvasBlob(working, mime, target === 'png' ? undefined : 0.96)
  if (working !== canvas) {
    working.width = 0
    working.height = 0
  }
  return new Uint8Array(await blob.arrayBuffer())
}

async function canvasToPdf(canvas) {
  const png = await rasterBytes(canvas, 'png')
  return imagesToPdf([{ name: 'artwork.png', type: 'image/png', bytes: png }])
}

async function encodePngWithMagick(png, target) {
  const source = new Blob([png], { type: 'image/png' })
  Object.defineProperty(source, 'name', { value: 'rendered-artwork.png' })
  const { convertWithImageMagick } = await import('./magickEngine.js')
  const result = await convertWithImageMagick(source, {
    engineSource: 'PNG',
    engineFormat: target === 'jpg' ? 'JPEG' : 'WEBP',
    targetExtension: target,
    targetLabel: target.toUpperCase(),
    targetMime: MIME[target],
  })
  return result.bytes
}

async function encodeCanvas(canvas, target) {
  if (target === 'pdf') return canvasToPdf(canvas)
  if (target === 'png') return rasterBytes(canvas, 'png')
  const png = await rasterBytes(canvas, 'png')
  return encodePngWithMagick(png, target)
}

async function readPsdFile(file, { composite = false } = {}) {
  const { readPsd } = await import('ag-psd')
  const buffer = await file.arrayBuffer()
  const common = {
    skipLayerImageData: true,
    skipThumbnail: true,
    skipLinkedFilesData: true,
    logMissingFeatures: false,
    totalMemoryLimit: 512 * 1024 * 1024,
  }
  const structure = readPsd(buffer, { ...common, skipCompositeImageData: true })
  const layers = flattenPsdLayers(structure.children)
  assertPsdFidelityLimits(structure, layers)
  if (!composite) return { psd: structure, layers }

  const psd = readPsd(buffer, common)
  if (!psd.canvas) throw new Error('This PSD does not contain a readable composite image.')
  return { psd, layers }
}

function xmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

async function wordBytes({ title, paragraphs = [], image = null, imageSize = null, table = null, monospace = false }) {
  const {
    Document,
    HeadingLevel,
    ImageRun,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = await import('docx')

  const children = [new Paragraph({ text: title, heading: HeadingLevel.TITLE })]
  for (const paragraph of paragraphs) {
    if (paragraph.heading) {
      children.push(new Paragraph({ text: paragraph.text, heading: HeadingLevel.HEADING_1 }))
    } else {
      children.push(new Paragraph({
        spacing: monospace ? { before: 0, after: 0, line: 276 } : undefined,
        children: [new TextRun({
          text: paragraph.text || '',
          font: monospace ? 'Aptos Mono' : 'Aptos',
          size: monospace ? 20 : 22,
        })],
      }))
    }
  }
  if (image) {
    children.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: image,
            type: 'png',
            transformation: imageSize,
          }),
        ],
      }),
    )
  }
  if (table?.length) {
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: table.map(
          (row, rowIndex) =>
            new TableRow({
              children: row.map(
                (cell) =>
                  new TableCell({
                    shading: rowIndex === 0 ? { fill: '8B2F22', color: 'auto' } : undefined,
                    margins: { top: 90, right: 100, bottom: 90, left: 100 },
                    children: [new Paragraph({
                      children: [new TextRun({
                        text: String(cell ?? ''),
                        bold: rowIndex === 0,
                        color: rowIndex === 0 ? 'FFFFFF' : '1C1710',
                        font: 'Aptos',
                        size: 18,
                      })],
                    })],
                  }),
              ),
            }),
        ),
      }),
    )
  }
  const document = new Document({
    title,
    creator: 'Massicot',
    sections: [{
      properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } },
      children,
    }],
  })
  const blob = await Packer.toBlob(document)
  return new Uint8Array(await blob.arrayBuffer())
}

function htmlToText(html) {
  const documentNode = new DOMParser().parseFromString(html, 'text/html')
  documentNode.querySelectorAll('script, style, noscript').forEach((node) => node.remove())
  return (documentNode.body.textContent || '').replace(/\n\s*\n\s*\n/g, '\n\n').trim()
}

function textToHtml(text, title) {
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${xmlEscape(title)}</title>\n<style>:root{color-scheme:light}*{box-sizing:border-box}html{background:#f3eee4;color:#1c1710}body{max-width:1040px;margin:48px auto;padding:0 24px;font:16px/1.6 system-ui,sans-serif}header{padding:20px 24px;color:#fff;background:#1c1710;border-bottom:4px solid #c7432f}h1{overflow-wrap:anywhere;margin:0;font-size:18px}pre{overflow:auto;margin:0;padding:28px 24px;border:1px solid #d7cfc0;border-top:0;background:#fffdf8;white-space:pre-wrap;overflow-wrap:anywhere;tab-size:4;font:14px/1.65 "Aptos Mono","Cascadia Mono",Consolas,monospace}@media(max-width:700px){body{margin:0;padding:0}header,pre{border-left:0;border-right:0}}</style>\n</head>\n<body><header><h1>${xmlEscape(title)}</h1></header><main><pre>${xmlEscape(text)}</pre></main></body>\n</html>`
}

function sanitizeHtmlForRendering(raw) {
  const documentNode = new DOMParser().parseFromString(raw, 'text/html')
  const unsupported = documentNode.querySelector('script, iframe, frame, object, embed, canvas')
  if (unsupported) {
    throw new Error(
      `This HTML contains <${unsupported.tagName.toLowerCase()}> content that cannot be reproduced safely as static page artwork. Export a self-contained static HTML copy first; nothing was silently removed.`,
    )
  }
  documentNode.querySelectorAll('meta[http-equiv="refresh"]').forEach((node) => node.remove())
  documentNode.querySelectorAll('*').forEach((node) => {
    for (const attribute of [...node.attributes]) {
      if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name)
    }
  })

  const resourceAttributes = [
    ['[src]', 'src'], ['[poster]', 'poster'], ['link[rel~="stylesheet"][href]', 'href'],
    ['image[href], use[href], feImage[href]', 'href'],
    ['image[xlink\\:href], use[xlink\\:href], feImage[xlink\\:href]', 'xlink:href'],
  ]
  for (const [selector, attribute] of resourceAttributes) {
    for (const node of documentNode.querySelectorAll(selector)) {
      const value = node.getAttribute(attribute)?.trim()
      if (value && !value.startsWith('data:')) {
        throw new Error(
          `The HTML references an external resource (${value.slice(0, 90)}). Embed images, fonts and stylesheets as data URIs so the PDF cannot silently lose them.`,
        )
      }
    }
  }
  if (documentNode.querySelector('[srcset]')) {
    throw new Error('This HTML uses srcset, whose selected resource can vary by device. Replace it with one embedded data-URI src before converting.')
  }
  for (const css of [...documentNode.querySelectorAll('style')].map((node) => node.textContent || '')
    .concat([...documentNode.querySelectorAll('[style]')].map((node) => node.getAttribute('style') || ''))) {
    const externalUrl = externalCssResource(css)
    if (externalUrl) {
      throw new Error(
        `The HTML stylesheet references an external resource (${externalUrl.slice(0, 90)}). Embed it before converting so the visual theme stays complete.`,
      )
    }
  }
  return '<!doctype html>\n' + documentNode.documentElement.outerHTML
}

async function htmlToNativePdf(raw, title) {
  const cleanHtml = sanitizeHtmlForRendering(raw)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('sandbox', 'allow-same-origin')
  iframe.setAttribute('aria-hidden', 'true')
  Object.assign(iframe.style, {
    position: 'fixed', left: '-20000px', top: '0', width: '1200px', height: '800px',
    border: '0', zIndex: '-2147483648', pointerEvents: 'none',
  })
  document.body.appendChild(iframe)

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('The HTML document took too long to prepare.')), 12_000)
      iframe.onload = () => {
        clearTimeout(timeout)
        resolve()
      }
      iframe.srcdoc = cleanHtml
    })
    const frameDocument = iframe.contentDocument
    if (!frameDocument?.body) throw new Error('The browser could not create a safe rendering document.')
    await frameDocument.fonts?.ready
    const images = [...frameDocument.images]
    await Promise.all(images.map((image) => image.complete
      ? (image.naturalWidth > 0
          ? Promise.resolve()
          : Promise.reject(new Error(`The embedded image “${image.alt || 'untitled'}” could not be rendered.`)))
      : new Promise((resolve, reject) => {
          image.addEventListener('load', resolve, { once: true })
          image.addEventListener('error', () => reject(new Error(`The embedded image “${image.alt || 'untitled'}” could not be rendered.`)), { once: true })
        })))

    return nativeHtmlDocumentToPdf(frameDocument, title)
  } finally {
    iframe.remove()
  }
}

async function convertPsd(file, target) {
  if (target === 'xlsx') {
    const { psd, layers } = await readPsdFile(file, { composite: false })
    const rows = [
      ['No.', 'Layer name', 'Type', 'Visible', 'Opacity', 'Blend mode', 'Bounds', 'Text', 'Document size', 'Bits/channel', 'Colour mode'],
      ...layers.map((layer, index) => [
        index + 1,
        `${'  '.repeat(layer.depth)}${layer.name}`,
        layer.type,
        layer.visible,
        `${layer.opacity}%`,
        layer.blendMode,
        layer.bounds,
        layer.text,
        `${psd.width} × ${psd.height} px`,
        psd.bitsPerChannel ?? '',
        psd.colorMode ?? '',
      ]),
    ]
    const bytes = structuredRowsToXlsx(rows, { sheetName: 'PSD layer inventory' })
    return output(bytes, file, target)
  }

  const { psd, layers } = await readPsdFile(file, { composite: true })
  const canvas = psd.canvas
  if (target === 'docx') {
    const png = await rasterBytes(canvas, 'png')
    const scale = Math.min(1, 610 / canvas.width, 700 / canvas.height)
    const paragraphs = [
      { text: `${canvas.width} × ${canvas.height} px · ${layers.length} layers` },
      { text: 'Flattened artwork', heading: true },
    ]
    const table = [
      ['No.', 'Layer', 'Type', 'Visible', 'Opacity', 'Editable text'],
      ...layers.map((layer, index) => [index + 1, `${'› '.repeat(layer.depth)}${layer.name}`, layer.type, layer.visible, `${layer.opacity}%`, layer.text]),
    ]
    const bytes = await wordBytes({
      title: stem(file.name),
      paragraphs,
      image: png,
      imageSize: { width: Math.max(1, Math.round(canvas.width * scale)), height: Math.max(1, Math.round(canvas.height * scale)) },
      table,
    })
    canvas.width = 0
    canvas.height = 0
    return output(bytes, file, target)
  }
  const bytes = await encodeCanvas(canvas, target)
  canvas.width = 0
  canvas.height = 0
  return output(bytes, file, target)
}

async function convertPdf(file, target) {
  const { doc } = await openPdf(file)
  try {
    if (target === 'png' || target === 'jpg' || target === 'webp') {
      const files = await pdfToImages(doc, {
        format: 'png', dpi: 300, maxPixels: 32_000_000, maxTotalPixels: 480_000_000,
      })
      if (target !== 'png') {
        for (const page of files) {
          page.bytes = await encodePngWithMagick(page.bytes, target)
          page.name = page.name.replace(/\.png$/i, `.${target}`)
        }
      }
      if (files.length === 1) return output(files[0].bytes, file, target)
      return output(zipFiles(files), file, target, 'zip', MIME.zip)
    }
    const pages = await extractText(doc)
    if (target === 'txt') return output(encoder.encode(pages.map((page, index) => `— Page ${index + 1} —\n${page}`).join('\n\n')), file, target)
    const pdfMetadata = await doc.getMetadata()
      .then(({ info = {} }) => ({
        title: info.Title || '', author: info.Author || '', subject: info.Subject || '',
        keywords: info.Keywords || '', creator: info.Creator || '',
      }))
      .catch(() => ({}))
    const semanticPages = await pdfToSemanticPages(doc, {
      includeGraphics: target === 'docx',
      sampleBackgrounds: target === 'docx' || target === 'xlsx',
      graphicsDpi: 288,
    })
    if (target === 'xlsx') {
      return output(semanticPdfPagesToXlsx({
        title: stem(file.name), pages: semanticPages, metadata: pdfMetadata,
      }), file, target)
    }
    return output(await semanticPdfPagesToDocx({
      title: stem(file.name), pages: semanticPages, metadata: pdfMetadata,
    }), file, target)
  } finally {
    doc.destroy?.()
  }
}

async function convertTextual(file, source, target) {
  const raw = await file.text()
  const text = source === 'html' ? htmlToText(raw) : raw
  if (target === 'txt') return output(encoder.encode(text), file, target)
  if (target === 'html') return output(encoder.encode(textToHtml(text, stem(file.name))), file, target)
  if (source === 'html' && target === 'pdf') {
    return output(await htmlToNativePdf(raw, stem(file.name)), file, target)
  }
  if (target === 'pdf') return output(await nativeTextToPdf(text, stem(file.name)), file, target)
  const paragraphs = text.split(/\r?\n/).map((line) => ({ text: line }))
  return output(await wordBytes({ title: stem(file.name), paragraphs, monospace: source !== 'html' }), file, target)
}

async function convertData(file, source, target) {
  const raw = (await file.text()).replace(/^\uFEFF/, '')
  let rows
  let value
  if (source === 'csv') {
    rows = parseCsv(raw)
    value = csvRowsToRecords(rows)
  } else {
    try {
      value = JSON.parse(raw)
    } catch {
      throw new Error('This JSON file is not valid.')
    }
    rows = jsonRows(value)
  }

  if (target === 'xlsx') return output(structuredRowsToXlsx(rows, { sheetName: source === 'csv' ? 'CSV data' : 'JSON data' }), file, target)
  if (target === 'json') return output(encoder.encode(JSON.stringify(value, null, 2)), file, target)
  if (target === 'csv') return output(encoder.encode(rows.map((row) => row.map(csvCell).join(',')).join('\r\n')), file, target)
  return output(await nativeTableToPdf(rows, stem(file.name)), file, target)
}

async function convertImage(file, target) {
  if (target === 'pdf' && (/\.svg$/i.test(file.name) || file.type === 'image/svg+xml')) {
    return output(await nativeSvgToPdf(await sanitizeSvg(file), stem(file.name)), file, target)
  }
  const canvas = await imageFileToCanvas(file)
  const bytes = await encodeCanvas(canvas, target)
  canvas.width = 0
  canvas.height = 0
  return output(bytes, file, target)
}

async function convertUniversal(file, conversion) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (conversion.target === 'zip') {
    return output(packageOriginalFile(file.name, bytes), file, 'zip')
  }

  const encoded = bytesToBase64(bytes)
  if (conversion.target === 'base64') {
    return output(encoder.encode(encoded), file, 'txt', 'base64.txt', MIME.txt)
  }
  const mime = file.type || conversion.sourceMime || 'application/octet-stream'
  const dataUri = `data:${mime};base64,${encoded}`
  return output(encoder.encode(dataUri), file, 'txt', 'data-uri.txt', MIME.txt)
}

export async function convertFile(file, conversion) {
  validateFile(file, conversion)
  if (conversion.availability === 'ready' && conversion.qualityGate?.status !== 'passed') {
    throw new Error('This route has not passed its format-fidelity activation gate.')
  }
  if (conversion.availability !== 'ready') {
    throw new Error(`${conversion.engineLabel || 'The required conversion engine'} is not connected yet.`)
  }
  if (conversion.handler === 'universal') return convertUniversal(file, conversion)
  if (conversion.handler === 'textual') return convertTextual(file, conversion.source, conversion.target)
  if (conversion.handler === 'imagemagick') {
    const { convertWithImageMagick } = await import('./magickEngine.js')
    return convertWithImageMagick(file, conversion)
  }
  if (conversion.handler === 'pandoc') {
    const { convertWithPandoc } = await import('./pandocEngine.js')
    return convertWithPandoc(file, conversion)
  }
  if (conversion.handler === 'docx-pdf') {
    const { docxToLibreOfficePdf } = await import('./libreOfficePdfEngine.js')
    return output(await docxToLibreOfficePdf(file), file, 'pdf')
  }
  if (conversion.source === 'psd') return convertPsd(file, conversion.target)
  if (conversion.source === 'pdf') return convertPdf(file, conversion.target)
  if (conversion.source === 'txt' || conversion.source === 'html') {
    return convertTextual(file, conversion.source, conversion.target)
  }
  if (conversion.source === 'csv' || conversion.source === 'json') {
    return convertData(file, conversion.source, conversion.target)
  }
  return convertImage(file, conversion.target)
}
