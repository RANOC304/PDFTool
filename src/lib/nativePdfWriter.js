import pdfMake from 'pdfmake/build/pdfmake.js'
import pdfFonts from 'pdfmake/build/vfs_fonts.js'

pdfMake.addVirtualFileSystem(pdfFonts)

const A4 = { width: 595.28, height: 841.89 }

function displayValue(value) {
  if (value && typeof value === 'object') return JSON.stringify(value)
  return String(value ?? '')
}

async function createPdfBytes(definition) {
  const buffer = await pdfMake.createPdf({
    compress: true,
    ...definition,
  }).getBuffer()
  return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
}

function footer(currentPage, pageCount) {
  return {
    text: `${currentPage} / ${pageCount}`,
    alignment: 'right',
    color: '#6d665c',
    fontSize: 8,
    margin: [36, 12, 36, 0],
  }
}

export async function nativeTextToPdf(text, title) {
  return createPdfBytes({
    info: { title, creator: 'Massicot', subject: 'Editable text conversion' },
    pageSize: 'A4',
    pageMargins: [48, 48, 48, 46],
    footer,
    defaultStyle: { font: 'Roboto', fontSize: 10.5, color: '#1c1710', lineHeight: 1.25 },
    styles: {
      title: { fontSize: 15, bold: true, margin: [0, 0, 0, 8] },
      source: { fontSize: 9.5, preserveLeadingSpaces: true, preserveTrailingSpaces: true },
    },
    content: [
      { text: title, style: 'title' },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: A4.width - 96, y2: 0, lineWidth: 0.75, lineColor: '#d9d1c3' }], margin: [0, 0, 0, 12] },
      { text: String(text ?? '') || ' ', style: 'source' },
    ],
  })
}

export async function nativeTableToPdf(rows, title) {
  const safeRows = rows.length ? rows : [['']]
  const columnCount = Math.max(1, ...safeRows.map((row) => row.length))
  const body = safeRows.map((row, rowIndex) => Array.from({ length: columnCount }, (_, column) => ({
    text: displayValue(row[column]),
    bold: rowIndex === 0,
    color: rowIndex === 0 ? '#ffffff' : '#1c1710',
    fillColor: rowIndex === 0 ? '#8b2f22' : rowIndex % 2 ? '#f4eee2' : '#ffffff',
    margin: [4, 4, 4, 4],
  })))
  const landscape = columnCount > 3

  return createPdfBytes({
    info: { title, creator: 'Massicot', subject: 'Editable structured-data conversion' },
    pageSize: 'A4',
    pageOrientation: landscape ? 'landscape' : 'portrait',
    pageMargins: [32, 42, 32, 40],
    footer,
    defaultStyle: { font: 'Roboto', fontSize: columnCount > 8 ? 6.5 : 8.5, color: '#1c1710' },
    content: [
      { text: title, fontSize: 15, bold: true, margin: [0, 0, 0, 4] },
      { text: 'Structured data · native text and table cells', color: '#6d665c', fontSize: 8, margin: [0, 0, 0, 12] },
      {
        layout: {
          hLineColor: () => '#d5ccbd',
          vLineColor: () => '#d5ccbd',
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0,
        },
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: Array.from({ length: columnCount }, () => '*'),
          body,
        },
      },
    ],
  })
}

function svgLengthToPoints(value) {
  const match = String(value || '').trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+))(px|pt|pc|in|cm|mm)?$/i)
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount <= 0) return null
  const factors = { px: 0.75, pt: 1, pc: 12, in: 72, cm: 72 / 2.54, mm: 72 / 25.4 }
  return amount * factors[(match[2] || 'px').toLowerCase()]
}

function svgPageSize(svg) {
  const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
  const viewBox = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number)
  const viewWidth = viewBox.length === 4 && Number.isFinite(viewBox[2]) && viewBox[2] > 0 ? viewBox[2] * 0.75 : null
  const viewHeight = viewBox.length === 4 && Number.isFinite(viewBox[3]) && viewBox[3] > 0 ? viewBox[3] * 0.75 : null
  let width = svgLengthToPoints(root.getAttribute('width')) || viewWidth || A4.width
  let height = svgLengthToPoints(root.getAttribute('height')) || viewHeight || A4.height
  if (!svgLengthToPoints(root.getAttribute('width')) && svgLengthToPoints(root.getAttribute('height')) && viewWidth && viewHeight) {
    width = height * (viewWidth / viewHeight)
  }
  if (!svgLengthToPoints(root.getAttribute('height')) && svgLengthToPoints(root.getAttribute('width')) && viewWidth && viewHeight) {
    height = width * (viewHeight / viewWidth)
  }
  if (width > 14_400 || height > 14_400) {
    throw new Error('This SVG exceeds PDF’s 200-inch page limit. Reduce its declared physical canvas size before converting.')
  }
  return { width: Math.max(1, width), height: Math.max(1, height) }
}

export async function nativeSvgToPdf(svg, title) {
  const pageSize = svgPageSize(svg)
  return createPdfBytes({
    info: { title, creator: 'Massicot', subject: 'Native vector SVG conversion' },
    pageSize,
    pageMargins: [0, 0, 0, 0],
    defaultStyle: { font: 'Roboto' },
    content: [{ svg, width: pageSize.width, height: pageSize.height, margin: [0, 0, 0, 0] }],
  })
}

function pxToPt(value, fallback = 0) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed * 0.75 : fallback
}

function cssColor(value, fallback = undefined) {
  if (!value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)') return fallback
  const rgb = value.match(/^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i)
  if (!rgb) return value
  return `#${[rgb[1], rgb[2], rgb[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`
}

function styleForElement(element, windowNode, { inline = false } = {}) {
  const style = windowNode.getComputedStyle(element)
  const fontSizePx = Number.parseFloat(style.fontSize) || 16
  const weight = Number.parseInt(style.fontWeight, 10)
  const lineHeightPx = Number.parseFloat(style.lineHeight)
  const result = {
    fontSize: Math.max(4, Math.min(120, fontSizePx * 0.75)),
    bold: Number.isFinite(weight) ? weight >= 600 : /bold/i.test(style.fontWeight),
    italics: style.fontStyle === 'italic' || style.fontStyle === 'oblique',
    color: cssColor(style.color, '#1c1710'),
  }
  if (Number.isFinite(lineHeightPx) && lineHeightPx > 0) result.lineHeight = Math.max(0.75, Math.min(4, lineHeightPx / fontSizePx))
  if (style.letterSpacing && style.letterSpacing !== 'normal') result.characterSpacing = pxToPt(style.letterSpacing)
  if (/underline/.test(style.textDecorationLine)) result.decoration = 'underline'
  if (/line-through/.test(style.textDecorationLine)) result.decoration = result.decoration ? ['underline', 'lineThrough'] : 'lineThrough'
  const background = cssColor(style.backgroundColor)
  if (background) result.background = background
  if (!inline) {
    if (['left', 'right', 'center', 'justify'].includes(style.textAlign)) result.alignment = style.textAlign
    result.margin = [
      pxToPt(style.marginLeft),
      pxToPt(style.marginTop),
      pxToPt(style.marginRight),
      pxToPt(style.marginBottom),
    ].map((part) => Math.max(-72, Math.min(144, part)))
  }
  return result
}

function visibleElement(element, windowNode) {
  const style = windowNode.getComputedStyle(element)
  const rect = element.getBoundingClientRect()
  return style.display !== 'none' && style.visibility !== 'hidden' && (rect.width > 0 || rect.height > 0)
}

function assertNativeHtmlSupported(documentNode) {
  const windowNode = documentNode.defaultView
  if (!windowNode) throw new Error('The browser could not inspect this HTML document.')
  for (const element of documentNode.body.querySelectorAll('*')) {
    if (!visibleElement(element, windowNode)) continue
    const style = windowNode.getComputedStyle(element)
    if (style.position === 'fixed' || style.position === 'absolute') {
      throw new Error('This HTML uses fixed or absolute positioning. Native text PDF export refuses to flatten it; use a flow-layout HTML version so content stays selectable and editable.')
    }
    if (style.transform && style.transform !== 'none') {
      throw new Error('This HTML uses CSS transforms that cannot be reproduced faithfully as native PDF text. Remove the transform before converting.')
    }
    if (/grid/.test(style.display) || (/flex/.test(style.display) && element.children.length > 1)) {
      throw new Error('This HTML uses a multi-item grid or flex layout. Native PDF export will not rasterize it or silently change the layout; convert a print-flow version instead.')
    }
    const columnCount = Number.parseInt(style.columnCount, 10)
    if (Number.isFinite(columnCount) && columnCount > 1) {
      throw new Error('This HTML uses CSS multi-column layout, which is not yet safe for native-text export without reflow.')
    }
  }
}

function normalizeInlineText(value, preserveWhitespace) {
  if (preserveWhitespace) return value.replaceAll('\t', '    ')
  return value.replace(/\s+/g, ' ')
}

function inlineRuns(node, windowNode, context = {}) {
  if (node.nodeType === 3) {
    const text = normalizeInlineText(node.nodeValue || '', context.preserveWhitespace)
    return text ? [{ text }] : []
  }
  if (node.nodeType !== 1) return []
  const tag = node.tagName.toLowerCase()
  if (tag === 'br') return [{ text: '\n' }]
  if (['script', 'style', 'noscript', 'img', 'svg'].includes(tag)) return []
  const local = styleForElement(node, windowNode, { inline: true })
  const link = tag === 'a' ? node.getAttribute('href') : context.link
  const preserveWhitespace = context.preserveWhitespace || tag === 'pre' || tag === 'code'
  const descendants = [...node.childNodes].flatMap((child) => inlineRuns(child, windowNode, { link, preserveWhitespace }))
  return descendants.map((run) => ({
    ...local,
    ...run,
    ...(link ? { link } : {}),
    preserveLeadingSpaces: preserveWhitespace,
    preserveTrailingSpaces: preserveWhitespace,
  }))
}

function cleanRuns(runs) {
  if (!runs.length) return [{ text: ' ' }]
  const copy = runs.map((run) => ({ ...run }))
  if (!copy[0].preserveLeadingSpaces) copy[0].text = copy[0].text.replace(/^\s+/, '')
  if (!copy.at(-1).preserveTrailingSpaces) copy.at(-1).text = copy.at(-1).text.replace(/\s+$/, '')
  return copy.filter((run) => run.text)
}

function elementTextNode(element, windowNode, extra = {}) {
  const runs = cleanRuns([...element.childNodes].flatMap((child) => inlineRuns(child, windowNode, extra)))
  return { text: runs, ...styleForElement(element, windowNode) }
}

function dataUriSvg(value) {
  if (!/^data:image\/svg\+xml/i.test(value || '')) return null
  const comma = value.indexOf(',')
  if (comma < 0) return null
  const header = value.slice(0, comma)
  const payload = value.slice(comma + 1)
  try {
    return /;base64/i.test(header) ? atob(payload) : decodeURIComponent(payload)
  } catch {
    return null
  }
}

function imageNode(element, windowNode) {
  const source = element.currentSrc || element.getAttribute('src') || ''
  if (!source.startsWith('data:')) throw new Error('An HTML image is not embedded as a data URI.')
  const computed = windowNode.getComputedStyle(element)
  const width = Math.min(A4.width - 72, Math.max(1, pxToPt(computed.width, element.naturalWidth * 0.75)))
  const height = Math.max(1, pxToPt(computed.height, element.naturalHeight * 0.75))
  const svg = dataUriSvg(source)
  const node = svg ? { svg, width, height } : { image: source, width, height }
  return { ...node, ...styleForElement(element, windowNode) }
}

function tableNode(table, windowNode) {
  const tableRows = [...table.rows]
  const grid = []
  const occupied = []
  let maxColumns = 0
  tableRows.forEach((row, rowIndex) => {
    grid[rowIndex] ||= []
    occupied[rowIndex] ||= []
    let column = 0
    for (const cell of row.cells) {
      while (occupied[rowIndex][column]) {
        grid[rowIndex][column] ||= {}
        column++
      }
      const colSpan = Math.max(1, Number(cell.colSpan) || 1)
      const rowSpan = Math.max(1, Number(cell.rowSpan) || 1)
      const fillColor = cssColor(windowNode.getComputedStyle(cell).backgroundColor)
      const value = {
        ...elementTextNode(cell, windowNode),
        bold: cell.tagName.toLowerCase() === 'th' || styleForElement(cell, windowNode, { inline: true }).bold,
        ...(fillColor ? { fillColor } : {}),
        ...(colSpan > 1 ? { colSpan } : {}),
        ...(rowSpan > 1 ? { rowSpan } : {}),
      }
      delete value.background
      grid[rowIndex][column] = value
      for (let x = 0; x < colSpan; x++) {
        for (let y = 0; y < rowSpan; y++) {
          occupied[rowIndex + y] ||= []
          occupied[rowIndex + y][column + x] = true
          if (x || y) {
            grid[rowIndex + y] ||= []
            grid[rowIndex + y][column + x] ||= {}
          }
        }
      }
      column += colSpan
      maxColumns = Math.max(maxColumns, column)
    }
  })
  grid.forEach((row) => {
    while (row.length < maxColumns) row.push({})
  })
  return {
    ...styleForElement(table, windowNode),
    layout: 'lightHorizontalLines',
    table: {
      headerRows: table.tHead?.rows.length || 0,
      widths: Array.from({ length: Math.max(1, maxColumns) }, () => '*'),
      body: grid.length ? grid : [[{ text: ' ' }]],
    },
  }
}

function blockNodes(element, windowNode) {
  if (element.nodeType === 3) {
    const text = normalizeInlineText(element.nodeValue || '', false).trim()
    return text ? [{ text }] : []
  }
  if (element.nodeType !== 1 || !visibleElement(element, windowNode)) return []
  const tag = element.tagName.toLowerCase()
  if (['script', 'style', 'noscript'].includes(tag)) return []
  if (tag === 'img') return [imageNode(element, windowNode)]
  if (tag === 'svg') return [{ svg: element.outerHTML, ...styleForElement(element, windowNode) }]
  if (tag === 'hr') {
    return [{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: A4.width - 72, y2: 0, lineWidth: 0.7, lineColor: '#b8b0a3' }], ...styleForElement(element, windowNode) }]
  }
  if (tag === 'table') return [tableNode(element, windowNode)]
  if (tag === 'ul' || tag === 'ol') {
    const items = [...element.children]
      .filter((child) => child.tagName.toLowerCase() === 'li')
      .map((child) => elementTextNode(child, windowNode))
    return [{ [tag]: items, ...styleForElement(element, windowNode) }]
  }
  if (tag === 'pre') {
    return [{
      text: element.textContent || ' ',
      preserveLeadingSpaces: true,
      preserveTrailingSpaces: true,
      background: cssColor(windowNode.getComputedStyle(element).backgroundColor, '#f4eee2'),
      ...styleForElement(element, windowNode),
    }]
  }

  const blockTags = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'figcaption', 'dt', 'dd', 'address', 'summary'])
  if (blockTags.has(tag)) {
    const node = elementTextNode(element, windowNode)
    if (/^h[1-6]$/.test(tag)) {
      node.bold = true
      node.headlineLevel = Number(tag[1])
      node.bookmark = (element.id || undefined)
    }
    if (tag === 'blockquote') node.margin = [18, ...(node.margin || [0, 0, 0, 0]).slice(1)]
    return [node]
  }

  const childBlocks = [...element.children].flatMap((child) => blockNodes(child, windowNode))
  if (childBlocks.length) return childBlocks
  const text = elementTextNode(element, windowNode)
  return cleanRuns(text.text).length ? [text] : []
}

function applyPageBreaks(documentNode, nodes) {
  const sourceBlocks = [...documentNode.body.children].filter((element) => visibleElement(element, documentNode.defaultView))
  for (let index = 0; index < Math.min(sourceBlocks.length, nodes.length); index++) {
    const style = documentNode.defaultView.getComputedStyle(sourceBlocks[index])
    if (/^(always|page|left|right|recto|verso)$/.test(style.breakBefore || style.pageBreakBefore)) nodes[index].pageBreak = 'before'
    if (/^(always|page|left|right|recto|verso)$/.test(style.breakAfter || style.pageBreakAfter)) nodes[index].pageBreak = 'after'
  }
}

export async function nativeHtmlDocumentToPdf(documentNode, title) {
  assertNativeHtmlSupported(documentNode)
  const windowNode = documentNode.defaultView
  const content = [...documentNode.body.children].flatMap((element) => blockNodes(element, windowNode))
  applyPageBreaks(documentNode, content)
  return createPdfBytes({
    info: { title, creator: 'Massicot', subject: 'Native selectable HTML conversion' },
    pageSize: 'A4',
    pageMargins: [36, 36, 36, 36],
    defaultStyle: { font: 'Roboto', fontSize: 10.5, color: '#1c1710', lineHeight: 1.2 },
    content: content.length ? content : [{ text: ' ' }],
  })
}
