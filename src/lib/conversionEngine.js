import { PDFDocument } from 'pdf-lib'
import { strToU8, zipSync } from 'fflate'
import { extractText, imagesToPdf, openPdf, pdfToImages, zipFiles } from './pdfEngine.js'

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
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('This image could not be decoded by the browser.'))
      element.src = url
    })
    const sourceWidth = image.naturalWidth || image.width || 1600
    const sourceHeight = image.naturalHeight || image.height || 900
    const maxPixels = 40_000_000
    const scale = Math.min(1, Math.sqrt(maxPixels / (sourceWidth * sourceHeight)))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(sourceWidth * scale))
    canvas.height = Math.max(1, Math.round(sourceHeight * scale))
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function rasterBytes(canvas, target) {
  const mime = MIME[target]
  const needsWhite = target === 'jpg'
  const working = needsWhite ? canvasWithBackground(canvas, '#ffffff') : canvas
  const blob = await canvasBlob(working, mime, target === 'png' ? undefined : 0.9)
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

function flattenLayers(layers = [], depth = 0, rows = []) {
  for (const layer of layers) {
    rows.push({
      depth,
      name: layer.name || 'Untitled layer',
      type: layer.children?.length ? 'Group' : layer.text ? 'Text' : 'Layer',
      visible: layer.hidden ? 'No' : 'Yes',
      opacity: Math.round((layer.opacity ?? 1) * 100),
      blendMode: layer.blendMode || 'normal',
      bounds: [layer.left, layer.top, layer.right, layer.bottom].every(Number.isFinite)
        ? `${layer.left}, ${layer.top} → ${layer.right}, ${layer.bottom}`
        : '',
      text: layer.text?.text || '',
    })
    if (layer.children?.length) flattenLayers(layer.children, depth + 1, rows)
  }
  return rows
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
  const layers = flattenLayers(structure.children)
  if (structure.width > 12_000 || structure.height > 12_000 || structure.width * structure.height > 64_000_000) {
    throw new Error('This PSD is too large for safe in-browser conversion (maximum 64 megapixels).')
  }
  if (layers.length > 1_200) {
    throw new Error('This PSD has more than 1,200 layers, which is too large for safe in-browser conversion.')
  }
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

function columnName(index) {
  let result = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    result = String.fromCharCode(65 + ((n - 1) % 26)) + result
  }
  return result
}

function workbookBytes(rows, { sheetName = 'Conversion', headerRows = [0] } = {}) {
  const headerSet = new Set(headerRows)
  const widths = []
  for (const row of rows) {
    row.forEach((value, index) => {
      widths[index] = Math.min(55, Math.max(widths[index] || 10, String(value ?? '').length + 2))
    })
  }
  const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const ref = `${columnName(columnIndex)}${rowIndex + 1}`
          const safe = xmlEscape(String(value ?? '').slice(0, 32767))
          return `<c r="${ref}" t="inlineStr" s="${headerSet.has(rowIndex) ? 1 : 0}"><is><t xml:space="preserve">${safe}</t></is></c>`
        })
        .join('')
      return `<row r="${rowIndex + 1}">${cells}</row>`
    })
    .join('')

  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2442B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`,
  }
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, value]) => [name, strToU8(value)])), { level: 6 })
}

async function wordBytes({ title, paragraphs = [], image = null, imageSize = null, table = null }) {
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
      children.push(new Paragraph({ children: [new TextRun(paragraph.text || '')] }))
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
          (row) =>
            new TableRow({
              children: row.map(
                (cell) =>
                  new TableCell({
                    children: [new Paragraph({ children: [new TextRun(String(cell ?? ''))] })],
                  }),
              ),
            }),
        ),
      }),
    )
  }
  const document = new Document({ sections: [{ properties: {}, children }] })
  const blob = await Packer.toBlob(document)
  return new Uint8Array(await blob.arrayBuffer())
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"'
        index++
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''))
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''))
    rows.push(row)
  }
  return rows
}

function csvCell(value) {
  const text = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function jsonRows(value) {
  if (Array.isArray(value)) {
    if (!value.length) return [['Value']]
    if (value.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
      const headers = [...new Set(value.flatMap((item) => Object.keys(item)))]
      return [headers, ...value.map((item) => headers.map((header) => item[header] ?? ''))]
    }
    return [['Value'], ...value.map((item) => [item])]
  }
  if (value && typeof value === 'object') {
    return [['Key', 'Value'], ...Object.entries(value)]
  }
  return [['Value'], [value]]
}

function csvRowsToRecords(rows) {
  const [headers = [], ...body] = rows
  return body
    .filter((row) => row.some((cell) => cell !== ''))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header || `column_${index + 1}`, row[index] ?? ''])))
}

function htmlToText(html) {
  const documentNode = new DOMParser().parseFromString(html, 'text/html')
  documentNode.querySelectorAll('script, style, noscript').forEach((node) => node.remove())
  return (documentNode.body.textContent || '').replace(/\n\s*\n\s*\n/g, '\n\n').trim()
}

function textToHtml(text, title) {
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${xmlEscape(title)}</title>\n<style>body{max-width:760px;margin:48px auto;padding:0 24px;font:17px/1.65 system-ui,sans-serif;color:#1c1710}pre{white-space:pre-wrap;font:inherit}</style>\n</head>\n<body><pre>${xmlEscape(text)}</pre></body>\n</html>`
}

function wrapCanvasLine(context, text, maxWidth) {
  if (!text) return ['']
  const words = text.split(/\s+/)
  const lines = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (context.measureText(candidate).width <= maxWidth || !line) {
      line = candidate
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

async function textToPdf(text, title) {
  const pageWidth = 1240
  const pageHeight = 1754
  const padding = 92
  const lineHeight = 38
  const canvas = document.createElement('canvas')
  canvas.width = pageWidth
  canvas.height = pageHeight
  const context = canvas.getContext('2d')
  context.font = '26px "Segoe UI", Arial, sans-serif'
  const lines = String(text || '')
    .replaceAll('\t', '    ')
    .split(/\r?\n/)
    .flatMap((line) => wrapCanvasLine(context, line, pageWidth - padding * 2))
  if (!lines.length) lines.push('')

  const maxLines = Math.floor((pageHeight - padding * 2 - 58) / lineHeight)
  const pdf = await PDFDocument.create()
  for (let offset = 0; offset < lines.length; offset += maxLines) {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, pageWidth, pageHeight)
    context.fillStyle = '#1c1710'
    context.font = '600 22px "Segoe UI", Arial, sans-serif'
    context.fillText(title, padding, 58)
    context.font = '26px "Segoe UI", Arial, sans-serif'
    lines.slice(offset, offset + maxLines).forEach((line, index) => {
      context.fillText(line, padding, padding + 44 + index * lineHeight)
    })
    const png = await canvasBlob(canvas, 'image/png')
    const embedded = await pdf.embedPng(await png.arrayBuffer())
    const page = pdf.addPage([595.28, 841.89])
    page.drawImage(embedded, { x: 0, y: 0, width: 595.28, height: 841.89 })
  }
  canvas.width = 0
  canvas.height = 0
  return pdf.save()
}

async function convertPsd(file, target) {
  if (target === 'xlsx') {
    const { psd, layers } = await readPsdFile(file)
    const rows = [
      ['PSD document', file.name],
      ['Width', `${psd.width} px`],
      ['Height', `${psd.height} px`],
      ['Colour mode', String(psd.colorMode ?? '')],
      ['Bits per channel', String(psd.bitsPerChannel ?? '')],
      ['Layer count', String(layers.length)],
      [],
      ['No.', 'Layer name', 'Type', 'Visible', 'Opacity', 'Blend mode', 'Bounds', 'Text'],
      ...layers.map((layer, index) => [
        index + 1,
        `${'  '.repeat(layer.depth)}${layer.name}`,
        layer.type,
        layer.visible,
        `${layer.opacity}%`,
        layer.blendMode,
        layer.bounds,
        layer.text,
      ]),
    ]
    return output(workbookBytes(rows, { sheetName: 'PSD layers', headerRows: [0, 7] }), file, target)
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
      ['No.', 'Layer', 'Type', 'Visible', 'Opacity'],
      ...layers.map((layer, index) => [index + 1, `${'› '.repeat(layer.depth)}${layer.name}`, layer.type, layer.visible, `${layer.opacity}%`]),
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
  const bytes = target === 'pdf' ? await canvasToPdf(canvas) : await rasterBytes(canvas, target)
  canvas.width = 0
  canvas.height = 0
  return output(bytes, file, target)
}

async function convertPdf(file, target) {
  const { doc } = await openPdf(file)
  try {
    if (target === 'png' || target === 'jpg') {
      const files = await pdfToImages(doc, { format: target === 'jpg' ? 'jpeg' : 'png', scale: 2 })
      if (files.length === 1) return output(files[0].bytes, file, target)
      return output(zipFiles(files), file, target, 'zip', MIME.zip)
    }
    const pages = await extractText(doc)
    if (target === 'txt') return output(encoder.encode(pages.map((page, index) => `— Page ${index + 1} —\n${page}`).join('\n\n')), file, target)
    if (target === 'xlsx') {
      const rows = [['Page', 'Extracted text'], ...pages.map((page, index) => [index + 1, page])]
      return output(workbookBytes(rows, { sheetName: 'PDF text' }), file, target)
    }
    const paragraphs = pages.flatMap((page, index) => [
      { text: `Page ${index + 1}`, heading: true },
      ...page.split(/\r?\n/).map((text) => ({ text })),
    ])
    return output(await wordBytes({ title: stem(file.name), paragraphs }), file, target)
  } finally {
    doc.destroy?.()
  }
}

async function convertDocx(file, target) {
  const mammoth = await import('mammoth/mammoth.browser.js')
  const arrayBuffer = await file.arrayBuffer()
  if (target === 'html') {
    const { value } = await mammoth.convertToHtml({ arrayBuffer })
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${xmlEscape(stem(file.name))}</title></head><body>${value}</body></html>`
    return output(encoder.encode(html), file, target)
  }
  const { value } = await mammoth.extractRawText({ arrayBuffer })
  return output(encoder.encode(value), file, target)
}

async function convertTextual(file, source, target) {
  const raw = await file.text()
  const text = source === 'html' ? htmlToText(raw) : raw
  if (target === 'txt') return output(encoder.encode(text), file, target)
  if (target === 'html') return output(encoder.encode(textToHtml(text, stem(file.name))), file, target)
  if (target === 'pdf') return output(await textToPdf(text, stem(file.name)), file, target)
  const paragraphs = text.split(/\r?\n/).map((line) => ({ text: line }))
  return output(await wordBytes({ title: stem(file.name), paragraphs }), file, target)
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

  if (target === 'xlsx') return output(workbookBytes(rows, { sheetName: source === 'csv' ? 'CSV data' : 'JSON data' }), file, target)
  if (target === 'json') return output(encoder.encode(JSON.stringify(value, null, 2)), file, target)
  if (target === 'csv') return output(encoder.encode(rows.map((row) => row.map(csvCell).join(',')).join('\r\n')), file, target)
  const transcript = rows.map((row) => row.map((cell) => String(cell ?? '')).join('  |  ')).join('\n')
  return output(await textToPdf(transcript, stem(file.name)), file, target)
}

async function convertImage(file, target) {
  const canvas = await imageFileToCanvas(file)
  const bytes = target === 'pdf' ? await canvasToPdf(canvas) : await rasterBytes(canvas, target)
  canvas.width = 0
  canvas.height = 0
  return output(bytes, file, target)
}

export async function convertFile(file, conversion) {
  validateFile(file, conversion)
  if (conversion.source === 'psd') return convertPsd(file, conversion.target)
  if (conversion.source === 'pdf') return convertPdf(file, conversion.target)
  if (conversion.source === 'docx') return convertDocx(file, conversion.target)
  if (conversion.source === 'txt' || conversion.source === 'html') {
    return convertTextual(file, conversion.source, conversion.target)
  }
  if (conversion.source === 'csv' || conversion.source === 'json') {
    return convertData(file, conversion.source, conversion.target)
  }
  return convertImage(file, conversion.target)
}
