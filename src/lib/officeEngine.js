import { strToU8, zipSync } from 'fflate'

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

function xmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function safeSheetName(value, fallback) {
  const cleaned = String(value || fallback)
    .replace(/[\\/?*:[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || fallback).slice(0, 31)
}

function inlineCell(ref, value, style = 0) {
  const text = String(value ?? '')
  if (text.length > 32767) {
    throw new Error(`Excel cell ${ref} contains ${text.length.toLocaleString()} characters, above Excel's 32,767-character limit. The workbook was not created with truncated content.`)
  }
  const safe = xmlEscape(text)
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${safe}</t></is></c>`
}

function columnName(index) {
  let result = ''
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    result = String.fromCharCode(65 + ((value - 1) % 26)) + result
  }
  return result
}

function workbookStyles() {
  return `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="11"/><color rgb="FF1C1710"/><name val="Aptos"/><family val="2"/></font><font><b/><sz val="18"/><color rgb="FF1C1710"/><name val="Aptos Display"/><family val="2"/></font><font><i/><sz val="10"/><color rgb="FF6D665C"/><name val="Aptos"/><family val="2"/></font><font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Aptos"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2442B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
}

function displayCell(value) {
  if (value && typeof value === 'object') return JSON.stringify(value)
  return String(value ?? '')
}

function worksheetCell(ref, value, style) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}" s="${style}"><v>${value}</v></c>`
  }
  if (typeof value === 'boolean') {
    return `<c r="${ref}" t="b" s="${style}"><v>${value ? 1 : 0}</v></c>`
  }
  return inlineCell(ref, displayCell(value), style)
}

export function structuredRowsToXlsx(rows, { sheetName = 'Conversion', headerRows = [0] } = {}) {
  const headerSet = new Set(headerRows)
  const widths = []
  for (const row of rows) {
    row.forEach((value, index) => {
      widths[index] = Math.min(55, Math.max(widths[index] || 10, displayCell(value).length + 2))
    })
  }
  const cols = widths.map((width, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) =>
      worksheetCell(`${columnName(columnIndex)}${rowIndex + 1}`, value, headerSet.has(rowIndex) ? 3 : 0)).join('')
    return `<row r="${rowIndex + 1}">${cells}</row>`
  }).join('')
  const safeName = safeSheetName(sheetName, 'Conversion')
  const files = {
    '[Content_Types].xml': `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(safeName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': workbookStyles(),
    'xl/worksheets/sheet1.xml': `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${body}</sheetData><autoFilter ref="A1:${columnName(Math.max(0, widths.length - 1))}${Math.max(1, rows.length)}"/></worksheet>`,
  }
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, value]) => [name, strToU8(value)])), { level: 6 })
}

function assertEditablePdfPages(pages) {
  const scanLikePages = pages
    .filter((page) => page.hasGraphics && !page.items.some((item) => item.visible !== false && item.text.trim()))
    .map((page) => page.pageNumber)
  if (scanLikePages.length) {
    const label = scanLikePages.length > 8
      ? `${scanLikePages.slice(0, 8).join(', ')} and ${scanLikePages.length - 8} more`
      : scanLikePages.join(', ')
    throw new Error(
      `Page${scanLikePages.length === 1 ? '' : 's'} ${label} contain artwork but no embedded text layer. Massicot will not disguise page screenshots as editable Office content; OCR is required before this conversion.`,
    )
  }
}

function wordFontName(value) {
  const name = String(value || '').trim()
  if (!name || /sans-serif/i.test(name)) return 'Arial'
  if (/serif/i.test(name)) return 'Times New Roman'
  if (/mono/i.test(name)) return 'Courier New'
  return name.slice(0, 64)
}

function wordOutlineLevel(role) {
  if (role === 'Title') return 0
  const match = String(role || '').match(/^H([1-6])$/)
  return match ? Number(match[1]) - 1 : undefined
}

function visibleLineItems(line, tableItemIds = new Set()) {
  return line.items
    .filter((item) => !tableItemIds.has(item.id) && item.text !== '')
    .sort((a, b) => a.x - b.x)
}

function lineBounds(items) {
  const visible = items.filter((item) => item.text.trim())
  const measured = visible.length ? visible : items
  const x = Math.min(...measured.map((item) => item.x))
  const top = Math.min(...measured.map((item) => item.top))
  const right = Math.max(...measured.map((item) => item.x + item.width))
  const bottom = Math.max(...measured.map((item) => item.top + item.height))
  return { x, top, right, bottom, width: right - x, height: bottom - top }
}

function median(values) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function pageBodyFontSize(page) {
  const sizes = page.items
    .filter((item) => item.text.trim() && !page.tableItemIds.has(item.id))
    .map((item) => item.fontSize)
    .filter((size) => Number.isFinite(size) && size > 0)
  return Math.max(8, median(sizes) || 11)
}

function pageFlowBlocks(page) {
  const bodyFontSize = pageBodyFontSize(page)
  const lines = page.lines.map((line) => {
    const items = visibleLineItems(line, page.tableItemIds)
    if (!items.some((item) => item.text.trim())) return null
    const bounds = lineBounds(items)
    const lastVisible = [...items].reverse().find((item) => item.text.trim())
    return {
      ...bounds,
      items,
      segments: (line.segments || []).filter((segment) =>
        segment.items.some((item) => !page.tableItemIds.has(item.id) && item.text.trim())),
      role: line.role,
      fontSize: Math.max(...items.map((item) => item.fontSize)),
      continues: Boolean(lastVisible?.hasEOL),
      startsNewBlock: /^(?:[\u2022\u25cf\u25a0\u25e6*-]|\d+(?:\.\d+)*(?:[.)])?)\s+/.test(
        items.map((item) => item.text).join('').trim(),
      ),
    }
  }).filter(Boolean).sort((a, b) => a.top - b.top || a.x - b.x)

  const blocks = []
  for (const line of lines) {
    const block = blocks.at(-1)
    const previous = block?.lines.at(-1)
    const lineStep = previous ? line.top - previous.top : Infinity
    const continuationLimit = Math.max(previous?.fontSize || 0, line.fontSize) * 1.58
    const bodySized = Math.max(previous?.fontSize || 0, line.fontSize) <= bodyFontSize * 1.18
    const previousVisible = previous?.items.filter((item) => item.text.trim()) || []
    const previousMarker = previousVisible[0]?.text.trim() || ''
    const previousIsList = /^(?:[\u2022\u25cf\u25a0\u25e6*-]|\d+[.)])$/.test(previousMarker)
    const continuationX = previousIsList && previousVisible[1] ? previousVisible[1].x : previous?.x
    const horizontalTolerance = Math.max(8, Math.max(previous?.fontSize || 0, line.fontSize) * 1.25)
    const previousCenter = previous ? previous.x + previous.width / 2 : 0
    const lineCenter = line.x + line.width / 2
    const horizontallyCompatible = Math.abs(line.x - continuationX) <= horizontalTolerance ||
      Math.abs(lineCenter - previousCenter) <= horizontalTolerance
    if (previous?.continues && bodySized && horizontallyCompatible && !line.startsNewBlock && lineStep > 0 && lineStep <= continuationLimit) {
      block.lines.push(line)
      block.x = Math.min(block.x, line.x)
      block.top = Math.min(block.top, line.top)
      block.right = Math.max(block.right, line.right)
      block.bottom = Math.max(block.bottom, line.bottom)
      block.width = block.right - block.x
      block.height = block.bottom - block.top
      block.fontSize = Math.max(block.fontSize, line.fontSize)
      continue
    }
    blocks.push({ ...line, lines: [line] })
  }

  for (const block of blocks) {
    const steps = block.lines.slice(1).map((line, index) => line.top - block.lines[index].top)
    block.linePitch = Math.max(block.fontSize * 1.15, median(steps) || block.height + 1)
    block.text = block.lines.map((line) => line.items.map((item) => item.text).join('')).join(' ')
  }
  return blocks
}

function positionedPageBlocks(page) {
  const bodyFontSize = pageBodyFontSize(page)
  const lines = page.lines.flatMap((line) => {
    const sourceSegments = line.segments?.length ? line.segments : [line]
    return sourceSegments.map((segment) => {
      const items = visibleLineItems(segment, page.tableItemIds)
      if (!items.some((item) => item.text.trim())) return null
      const bounds = lineBounds(items)
      const lastVisible = [...items].reverse().find((item) => item.text.trim())
      return {
        ...bounds,
        items,
        role: segment.role || line.role,
        fontSize: Math.max(...items.map((item) => item.fontSize)),
        continues: Boolean(lastVisible?.hasEOL),
      }
    })
  }).filter(Boolean).sort((a, b) => a.top - b.top || a.x - b.x)

  const blocks = []
  for (const line of lines) {
    const candidate = [...blocks].reverse().find((block) => {
      const previous = block.lines.at(-1)
      const lineStep = line.top - previous.top
      const continuationLimit = Math.max(previous.fontSize, line.fontSize) * 1.65
      const xTolerance = Math.max(8, Math.min(previous.width, line.width) * 0.08)
      const similarSize = Math.max(previous.fontSize, line.fontSize) <= Math.min(previous.fontSize, line.fontSize) * 1.18
      return previous.continues && similarSize && lineStep > 0 && lineStep <= continuationLimit &&
        Math.abs(line.x - previous.x) <= xTolerance
    })
    if (!candidate) {
      blocks.push({ ...line, lines: [line] })
      continue
    }
    candidate.lines.push(line)
    candidate.x = Math.min(candidate.x, line.x)
    candidate.top = Math.min(candidate.top, line.top)
    candidate.right = Math.max(candidate.right, line.right)
    candidate.bottom = Math.max(candidate.bottom, line.bottom)
    candidate.width = candidate.right - candidate.x
    candidate.height = candidate.bottom - candidate.top
    candidate.fontSize = Math.max(candidate.fontSize, line.fontSize)
  }

  for (const block of blocks) {
    const steps = block.lines.slice(1).map((line, index) => line.top - block.lines[index].top)
    block.linePitch = Math.max(block.fontSize * 1.08, median(steps) || block.height + 1)
    block.text = block.lines.map((line) => line.items.map((item) => item.text).join('')).join(' ')
    block.bodyFontSize = bodyFontSize
  }
  return blocks
}

function pageIsTableOfContents(page) {
  const pageText = page.lines.map((line) => line.text || line.items.map((item) => item.text).join('')).join('\n')
  return /table\s+of\s+contents?/i.test(pageText) ||
    page.lines.filter((line) => /\.{4,}/.test(line.text || '') && /\d\s*$/.test(line.text || '')).length >= 3
}

function pageUsesPositionedLayout(page) {
  if (pageIsTableOfContents(page)) return false

  const wideSeparatedLines = page.lines.filter((line) => {
    const segments = (line.segments || []).filter((segment) =>
      segment.items.some((item) => !page.tableItemIds.has(item.id) && item.text.trim()))
    return segments.some((segment, index) => index > 0 &&
      segment.x - (segments[index - 1].x + segments[index - 1].width) > 36)
  }).length
  const artwork = page.graphics
  const artworkArea = artwork?.bounds ? artwork.bounds.width * artwork.bounds.height : 0
  const denseArtwork = artworkArea >= page.width * page.height * 0.2 && (artwork?.coverage || 0) >= 0.35
  const textOverArtwork = denseArtwork && page.items.filter((item) => {
    if (page.tableItemIds.has(item.id) || !item.text.trim()) return false
    const centerX = item.x + item.width / 2
    const centerY = item.top + item.height / 2
    return centerX >= artwork.bounds.x && centerX <= artwork.bounds.x + artwork.bounds.width &&
      centerY >= artwork.bounds.top && centerY <= artwork.bounds.top + artwork.bounds.height
  }).length >= 2
  // A single signature/date row or a dotted leader is still ordinary flow.
  // Repeated separated rows are the reliable signal for a real multi-column
  // or form-like composition that needs absolute editable objects.
  return wideSeparatedLines >= 3 || textOverArtwork
}

function blockListIndent(block, bodyFontSize) {
  if (block.fontSize > bodyFontSize * 1.18) return null
  const firstLine = block.lines[0]
  const visible = firstLine.items.filter((item) => item.text.trim())
  const first = visible[0]
  if (!first) return null
  const marker = first.text.trim()
  const separateMarker = /^(?:[\u2022\u25cf\u25a0\u25e6*-]|\d+[.)])$/.test(marker)
  const embeddedMarker = /^(?:[\u2022\u25cf\u25a0\u25e6*-]|\d+[.)])\s+/.test(first.text)
  if (!separateMarker && !embeddedMarker) return null
  const textItem = separateMarker ? visible[1] : null
  const textX = textItem?.x || first.x + Math.max(14, first.fontSize * 1.8)
  return {
    left: Math.round(textX * 20),
    hanging: Math.max(120, Math.round((textX - first.x) * 20)),
    markerTab: separateMarker,
    tabPosition: Math.round(textX * 20),
  }
}

function blockColumnTabs(block) {
  if (block.lines.length !== 1) return []
  const segments = (block.lines[0].segments || []).filter((segment) => segment.items.some((item) => item.text.trim()))
  return segments.slice(1).filter((segment, index) => {
    const previous = segments[index]
    return segment.x - (previous.x + previous.width) > 36
  }).map((segment) => ({
    itemId: segment.items.find((item) => item.text.trim())?.id,
    position: Math.round(segment.x * 20),
  })).filter((stop) => stop.itemId)
}

function blockAlignment(block, page, AlignmentType, listIndent, columnTabs = []) {
  if (listIndent || columnTabs.length) return AlignmentType.LEFT
  const center = block.x + block.width / 2
  const pageCenter = page.width / 2
  if (block.lines.length > 1) {
    const leftEdges = block.lines.map((line) => line.x)
    const rightEdges = block.lines.map((line) => line.right)
    const centers = block.lines.map((line) => line.x + line.width / 2)
    const spread = (values) => Math.max(...values) - Math.min(...values)
    const bodyFontSize = pageBodyFontSize(page)
    const headingLike = block.fontSize >= bodyFontSize * 1.3 || /^(?:Title|H[1-6])$/.test(block.role || '')
    if (!headingLike && spread(leftEdges) <= Math.max(3, block.fontSize * 0.45)) return AlignmentType.LEFT
    if (spread(rightEdges) <= Math.max(3, block.fontSize * 0.45)) return AlignmentType.RIGHT
    if (spread(centers) <= Math.max(5, block.fontSize * 0.7)) return AlignmentType.CENTER
  }
  if (block.width < page.width * 0.78 && Math.abs(center - pageCenter) <= page.width * 0.025) {
    return AlignmentType.CENTER
  }
  const rightMargin = Math.max(0, page.width - block.right)
  if (block.x > page.width * 0.45 && rightMargin < page.width * 0.13) return AlignmentType.RIGHT
  return AlignmentType.LEFT
}

function blockOutlineLevel(block, bodyFontSize) {
  const explicit = wordOutlineLevel(block.role)
  if (explicit !== undefined) return explicit
  if (block.lines.length > 1 || block.text.length > 180) return undefined
  if (block.fontSize >= bodyFontSize * 1.9) return 0
  if (block.fontSize >= bodyFontSize * 1.32) return 0
  if (block.fontSize >= bodyFontSize * 1.1) return 1
  return undefined
}

function lineWordChildren(line, page, word, { markerTab = false, forceBold = false, columnTabs = [] } = {}) {
  const { ExternalHyperlink, InternalHyperlink, Tab, TextRun } = word
  const children = []
  let previousRight = null
  let pendingSpace = false
  let skipNextGap = false
  const firstVisible = markerTab ? line.items.find((item) => item.text.trim()) : null
  for (const item of line.items) {
    if (!item.text.trim()) {
      if (!skipNextGap) pendingSpace ||= children.length > 0
      continue
    }
    const columnStop = columnTabs.find((stop) => stop.itemId === item.id)
    if (columnStop && children.length) {
      children.push(new TextRun({
        children: [new Tab()],
        font: wordFontName(item.fontFamily),
        size: Math.max(4, Math.min(400, Math.round(item.fontSize * 2))),
      }))
      pendingSpace = false
      skipNextGap = true
      previousRight = null
    }
    if (skipNextGap) {
      skipNextGap = false
    } else if (pendingSpace) {
      children.push(new TextRun({
        text: ' ',
        font: wordFontName(item.fontFamily),
        size: Math.max(4, Math.round(item.fontSize * 2)),
      }))
    } else if (previousRight !== null) {
      const average = Math.max(1, item.fontSize * 0.48)
      const gap = item.x - previousRight
      if (gap > average * 0.3) {
        children.push(new TextRun({
          text: ' '.repeat(Math.min(16, Math.max(1, Math.round(gap / average)))),
          font: wordFontName(item.fontFamily),
          size: Math.max(4, Math.min(400, Math.round(item.fontSize * 2))),
        }))
      }
    }
    const run = new TextRun({
      text: item.text,
      font: wordFontName(item.fontFamily),
      size: Math.max(4, Math.min(400, Math.round(item.fontSize * 2))),
      bold: forceBold || item.bold,
      italics: item.italics,
      color: String(item.color || '000000').replace(/^#/, ''),
      vanish: item.visible === false,
      rightToLeft: item.dir === 'rtl',
      language: page.language ? { value: page.language } : undefined,
    })
    children.push(
      item.link
        ? new ExternalHyperlink({ children: [run], link: item.link })
        : item.destinationPageNumber
          ? new InternalHyperlink({ children: [run], anchor: `pdf-page-${item.destinationPageNumber}` })
          : run,
    )
    if (item === firstVisible) {
      children.push(new TextRun({
        children: [new Tab()],
        font: wordFontName(item.fontFamily),
        size: Math.max(4, Math.min(400, Math.round(item.fontSize * 2))),
      }))
      skipNextGap = true
    }
    previousRight = item.x + item.width
    pendingSpace = false
  }
  return children.length ? children : [new TextRun('')]
}

function blockWordChildren(block, page, word, { markerTab = false, forceBold = false, columnTabs = [] } = {}) {
  const { TextRun } = word
  const children = []
  const preserveSourceBreaks = /(?:https?:\/\/|www\.)/i.test(block.text)
  block.lines.forEach((line, index) => {
    children.push(...lineWordChildren(line, page, word, {
      markerTab: markerTab && index === 0,
      forceBold,
      columnTabs: index === 0 ? columnTabs : [],
    }))
    if (index === block.lines.length - 1) return
    if (preserveSourceBreaks) {
      children.push(new TextRun({ break: 1 }))
      return
    }
    const tail = [...line.items].reverse().find((item) => item.text.trim())?.text.trimEnd() || ''
    const next = block.lines[index + 1].items.find((item) => item.text.trim())?.text.trimStart() || ''
    if (!tail.endsWith('-') && !/^[,.;:!?)]/.test(next)) {
      children.push(new TextRun({
        text: ' ',
        font: wordFontName(line.items.at(-1)?.fontFamily),
        size: Math.max(4, Math.round((line.items.at(-1)?.fontSize || block.fontSize) * 2)),
      }))
    }
  })
  return children
}

function cellItemLines(items) {
  const lines = []
  for (const item of [...(items || [])].sort((a, b) => a.baseline - b.baseline || a.x - b.x)) {
    const line = lines.findLast((candidate) =>
      Math.abs(candidate.baseline - item.baseline) <= Math.max(1.5, item.fontSize * 0.34))
    if (line) {
      line.items.push(item)
      line.baseline = (line.baseline * (line.items.length - 1) + item.baseline) / line.items.length
    } else {
      lines.push({ items: [item], baseline: item.baseline })
    }
  }
  for (const line of lines) line.items.sort((a, b) => a.x - b.x)
  return lines
}

function cellBackgroundColor(cell) {
  const colors = (cell?.items || [])
    .map((item) => String(item.backgroundColor || '').replace(/^#/, '').toUpperCase())
    .filter((color) => /^[0-9A-F]{6}$/.test(color) && !/^(?:FFFFFF|FEFEFE|FDFDFD)$/.test(color))
  if (!colors.length) return cell?.header ? 'E9E4DA' : undefined
  return [...new Set(colors)].sort((a, b) =>
    colors.filter((color) => color === b).length - colors.filter((color) => color === a).length)[0]
}

function wordTable(table, page, word, { positioned = false } = {}) {
  const {
    AlignmentType,
    HeightRule,
    OverlapType,
    Paragraph,
    Table,
    TableAnchorType,
    TableCell,
    TableLayoutType,
    TableRow,
    TextRun,
    VerticalAlign,
    WidthType,
  } = word
  const columnCount = Math.max(1, ...table.rows.map((row) => row.length))
  const widthTwips = Math.max(120, Math.round(table.bounds.width * 20))
  const measured = table.columnWidths?.length
    ? table.columnWidths.map((value) => Math.max(60, Math.round(value * 20)))
    : Array.from({ length: columnCount }, (_, column) => {
      const cell = table.rows[0]?.[column]
      return cell ? Math.max(60, Math.round(cell.bounds.width * 20)) : Math.round(widthTwips / columnCount)
    })
  const measuredTotal = measured.reduce((sum, value) => sum + value, 0)
  const columnWidths = measured.map((value) => Math.max(60, Math.round((value / measuredTotal) * widthTwips)))
  const exactGeometry = positioned || /^vector-table-/.test(table.id || '')
  return new Table({
    width: { size: widthTwips, type: WidthType.DXA },
    indent: positioned ? undefined : { size: Math.max(0, Math.round(table.bounds.x * 20)), type: WidthType.DXA },
    float: positioned ? {
      horizontalAnchor: TableAnchorType.PAGE,
      verticalAnchor: TableAnchorType.PAGE,
      absoluteHorizontalPosition: Math.max(0, Math.round(table.bounds.x * 20)),
      absoluteVerticalPosition: Math.max(0, Math.round(table.bounds.top * 20)),
      leftFromText: 0,
      rightFromText: 0,
      topFromText: 0,
      bottomFromText: 0,
      overlap: OverlapType.OVERLAP,
    } : undefined,
    columnWidths,
    layout: TableLayoutType.FIXED,
    margins: { top: 20, right: 60, bottom: 20, left: 60 },
    rows: table.rows.map((cells) => {
      const rowTop = Math.min(...cells.map((cell) => cell.bounds.top))
      const rowBottom = Math.max(...cells.map((cell) => cell.bounds.top + cell.bounds.height))
      return new TableRow({
        height: {
          value: Math.max(120, Math.round((rowBottom - rowTop + (exactGeometry ? 0 : 2)) * 20)),
          rule: exactGeometry ? HeightRule.EXACT : HeightRule.ATLEAST,
        },
        children: cells.map((cell, column) => {
          const fontSize = cell?.items?.length
            ? Math.max(6, Math.min(72, Math.max(...cell.items.map((item) => item.fontSize))))
            : 9
          const itemLines = cellItemLines(cell?.items)
          const cellParagraphs = itemLines.length ? itemLines : String(cell?.text || '').split('\n').map((text) => ({ text }))
          return new TableCell({
            width: { size: Math.max(60, Math.round((cell?.bounds?.width || columnWidths[column] / 20) * 20)), type: WidthType.DXA },
            columnSpan: Math.max(1, cell?.columnSpan || 1),
            verticalAlign: VerticalAlign.CENTER,
            shading: cellBackgroundColor(cell) ? { fill: cellBackgroundColor(cell), color: 'auto' } : undefined,
            children: cellParagraphs.map((line) => new Paragraph({
              alignment: line.items?.length ? (() => {
                const bounds = lineBounds(line.items)
                const leftGap = Math.max(0, bounds.x - cell.bounds.x)
                const rightGap = Math.max(0, cell.bounds.x + cell.bounds.width - bounds.right)
                return Math.abs(leftGap - rightGap) <= Math.max(3, cell.bounds.width * 0.08)
                  ? AlignmentType.CENTER
                  : rightGap + Math.max(3, cell.bounds.width * 0.06) < leftGap
                    ? AlignmentType.RIGHT
                    : AlignmentType.LEFT
              })() : AlignmentType.LEFT,
              spacing: { before: 0, after: 0 },
              children: line.items?.length ? lineWordChildren(line, page, word) : [new TextRun({
                text: line.text,
                bold: Boolean(cell?.header),
                font: wordFontName(cell?.items?.[0]?.fontFamily),
                size: Math.round(fontSize * 2),
              })],
            })),
          })
        }),
      })
    }),
  })
}

function positionedWordTextBox(block, page, word, alignment, outlineLevel) {
  const {
    HorizontalPositionRelativeFrom,
    LineRuleType,
    Paragraph,
    TextWrappingType,
    VerticalAnchor,
    VerticalPositionRelativeFrom,
    WpsShapeRun,
  } = word
  const width = Math.max(8, Math.min(page.width - block.x, block.width + 6))
  const height = Math.max(8, block.height + Math.max(4, block.fontSize * 0.35))
  return new Paragraph({
    spacing: { before: 0, after: 0, line: 1, lineRule: LineRuleType.EXACT },
    children: [new WpsShapeRun({
      type: 'wps',
      transformation: {
        width: Math.max(1, Math.round((width * 96) / 72)),
        height: Math.max(1, Math.round((height * 96) / 72)),
      },
      floating: {
        horizontalPosition: {
          relative: HorizontalPositionRelativeFrom.PAGE,
          offset: Math.max(0, Math.round(block.x * 12_700)),
        },
        verticalPosition: {
          relative: VerticalPositionRelativeFrom.PAGE,
          offset: Math.max(0, Math.round(block.top * 12_700)),
        },
        allowOverlap: true,
        wrap: { type: TextWrappingType.NONE },
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
      },
      altText: {
        title: block.text.slice(0, 80) || 'Editable PDF text',
        description: 'Editable text reconstructed at its original PDF page position.',
        name: `Editable text on PDF page ${page.pageNumber}`,
      },
      outline: { type: 'noFill' },
      nonVisualProperties: { txBox: '1' },
      bodyProperties: {
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        verticalAnchor: VerticalAnchor.TOP,
        noAutoFit: true,
      },
      children: [new Paragraph({
        outlineLevel,
        alignment,
        bidirectional: block.lines.some((line) => line.items.some((item) => item.dir === 'rtl')),
        spacing: {
          before: 0,
          after: 0,
          line: Math.max(20, Math.round(block.linePitch * 20)),
          lineRule: LineRuleType.AT_LEAST,
        },
        children: blockWordChildren(block, page, word),
      })],
    })],
  })
}

export async function semanticPdfPagesToDocx({ title, pages, metadata = {} }) {
  if (!pages.length) throw new Error('The PDF does not contain any pages.')
  assertEditablePdfPages(pages)
  const word = await import('docx')
  const {
    AlignmentType,
    Bookmark,
    Document,
    Footer,
    HorizontalPositionRelativeFrom,
    ImageRun,
    LineRuleType,
    Packer,
    Paragraph,
    SectionType,
    TabStopType,
    TextRun,
    TextWrappingType,
    VerticalPositionRelativeFrom,
  } = word

  const sections = pages.map((page, pageIndex) => {
    const children = [new Paragraph({
      spacing: { before: 0, after: 0, line: 1, lineRule: LineRuleType.EXACT },
      children: [new Bookmark({
        id: `pdf-page-${page.pageNumber}`,
        children: [new TextRun({ text: '', vanish: true })],
      })],
    })]
    const verticalSpacer = (height) => new Paragraph({
      spacing: {
        before: 0,
        after: 0,
        line: Math.max(1, Math.round(height * 20)),
        lineRule: LineRuleType.EXACT,
      },
      children: [new TextRun({ text: '', vanish: true })],
    })
    const artwork = page.graphics?.bytes
      ? page.graphics
      : page.graphics
        ? { bytes: page.graphics, bounds: { x: 0, top: 0, width: page.width, height: page.height } }
        : null
    if (artwork) {
      children.push(new Paragraph({
        spacing: { before: 0, after: 0, line: 1, lineRule: LineRuleType.EXACT },
        children: [new ImageRun({
          data: artwork.bytes,
          type: 'png',
          transformation: {
            width: Math.max(1, Math.round((artwork.bounds.width * 96) / 72)),
            height: Math.max(1, Math.round((artwork.bounds.height * 96) / 72)),
          },
          altText: {
            title: `Artwork from PDF page ${page.pageNumber}`,
            description: 'Original non-text artwork only; editable text is stored separately as native Word runs.',
            name: `Artwork ${page.pageNumber}`,
          },
          floating: {
            horizontalPosition: {
              relative: HorizontalPositionRelativeFrom.PAGE,
              offset: Math.max(0, Math.round(artwork.bounds.x * 12_700)),
            },
            verticalPosition: {
              relative: VerticalPositionRelativeFrom.PAGE,
              offset: Math.max(0, Math.round(artwork.bounds.top * 12_700)),
            },
            allowOverlap: true,
            behindDocument: true,
            wrap: { type: TextWrappingType.NONE },
            margins: { top: 0, right: 0, bottom: 0, left: 0 },
          },
        })],
      }))
    }

    const bodyFontSize = pageBodyFontSize(page)
    const tableOfContents = pageIsTableOfContents(page)
    const allFlowBlocks = pageFlowBlocks(page)
    const pageNumberBlock = allFlowBlocks.find((block) =>
      block.top > page.height * 0.9 && /^\d+$/.test(block.text.trim()))
    const flowBlocks = allFlowBlocks.filter((block) => block !== pageNumberBlock)
    const positioned = pageUsesPositionedLayout(page)
    const textBlocks = positioned
      ? positionedPageBlocks(page).filter((block) => !pageNumberBlock || Math.abs(block.top - pageNumberBlock.top) > 1)
      : flowBlocks
    const flowNodes = [
      ...textBlocks.map((block) => ({ type: 'text', top: block.top, bottom: block.bottom, block })),
      ...page.tables.map((table) => ({
        type: 'table',
        top: table.bounds.top,
        bottom: table.bounds.top + table.bounds.height,
        table,
      })),
    ].sort((a, b) => a.top - b.top || (a.type === 'table' ? -1 : 1))
    let sourceBottom = 0
    for (const node of flowNodes) {
      const before = Math.max(0, node.top - sourceBottom)
      if (node.type === 'table') {
        if (!positioned) {
          if (before > 0.5) children.push(verticalSpacer(before))
          children.push(wordTable(node.table, page, word, { positioned: true }))
          children.push(verticalSpacer(node.table.bounds.height))
        } else {
          children.push(wordTable(node.table, page, word, { positioned: true }))
        }
        sourceBottom = Math.max(sourceBottom, node.bottom)
        continue
      }

      const { block } = node
      const listIndent = blockListIndent(block, bodyFontSize)
      const columnTabs = blockColumnTabs(block)
      const alignment = blockAlignment(block, page, AlignmentType, listIndent, columnTabs)
      let left = Math.max(0, Math.min(page.width - 6, block.x))
      const metricTolerance = !tableOfContents && (block.lines.length === 1 || /(?:https?:\/\/|www\.)/i.test(block.text))
        ? Math.max(4, block.fontSize * 0.55)
        : 0
      const rightEdge = Math.max(left + 6, Math.min(page.width, block.right + metricTolerance))
      let right = Math.max(0, page.width - rightEdge)
      if (/\.{4,}/.test(block.text)) {
        left = Math.max(36, left - 18)
        right = Math.max(36, right - 18)
      }
      let indent = listIndent
        ? { left: listIndent.left, hanging: listIndent.hanging, right: Math.round(right * 20) }
        : (alignment === AlignmentType.CENTER
        ? { left: Math.round(left * 20), right: Math.round(right * 20) }
        : alignment === AlignmentType.RIGHT
          ? { left: Math.round(Math.min(left, page.width * 0.15) * 20), right: Math.round(right * 20) }
          : { left: Math.round(left * 20), right: Math.round(right * 20) })
      const tocNumber = tableOfContents ? block.text.trim().match(/^(\d+(?:\.\d+)*)/)?.[1] : null
      const tocLevel = tocNumber ? tocNumber.split('.').length - 1 : 0
      if (tocLevel > 0) indent = { ...indent, left: (indent.left || 0) + tocLevel * 440 }
      const topLevelTocEntry = Boolean(tableOfContents && tocNumber && tocLevel === 0)
      const outlineLevel = blockOutlineLevel(block, bodyFontSize)
      if (positioned) {
        children.push(positionedWordTextBox(block, page, word, alignment, outlineLevel))
        sourceBottom = Math.max(sourceBottom, node.bottom)
        continue
      }
      if (before > 0.5) children.push(verticalSpacer(before))
      children.push(new Paragraph({
        outlineLevel,
        alignment,
        tabStops: [
          ...(listIndent?.markerTab ? [{ type: TabStopType.LEFT, position: listIndent.tabPosition }] : []),
          ...columnTabs.map((stop) => ({ type: TabStopType.LEFT, position: stop.position })),
        ],
        keepNext: outlineLevel !== undefined,
        bidirectional: block.lines.some((line) => line.items.some((item) => item.dir === 'rtl')),
        indent,
        spacing: {
          before: 0,
          after: 0,
          line: Math.max(20, Math.round(block.linePitch * 20)),
          lineRule: LineRuleType.EXACT,
        },
        children: blockWordChildren(block, page, word, {
          markerTab: Boolean(listIndent?.markerTab),
          forceBold: topLevelTocEntry,
          columnTabs,
        }),
      }))
      sourceBottom = Math.max(sourceBottom, block.top + block.lines.length * block.linePitch)
    }
    if (!children.length) children.push(new Paragraph(''))
    const footerItem = pageNumberBlock?.lines[0]?.items.find((item) => item.text.trim())
    const footer = pageNumberBlock ? new Footer({
      children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        indent: { right: Math.max(0, Math.round((page.width - pageNumberBlock.right) * 20)) },
        spacing: { before: 0, after: 0 },
        children: [new TextRun({
          text: pageNumberBlock.text.trim(),
          font: wordFontName(footerItem?.fontFamily),
          size: Math.max(4, Math.round((footerItem?.fontSize || 9) * 2)),
          color: String(footerItem?.color || '000000').replace(/^#/, ''),
        })],
      })],
    }) : undefined
    return {
      footers: footer ? { default: footer } : undefined,
      properties: {
        type: pageIndex === 0 ? undefined : SectionType.NEXT_PAGE,
        page: {
          size: { width: Math.max(1, Math.round(page.width * 20)), height: Math.max(1, Math.round(page.height * 20)) },
          margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: footer ? 720 : 0, gutter: 0 },
        },
      },
      children,
    }
  })

  const document = new Document({
    title: metadata.title || title,
    subject: metadata.subject || 'Editable PDF conversion',
    creator: metadata.author || metadata.creator || 'Massicot',
    keywords: metadata.keywords || '',
    description: 'Native editable Word text, tables and links with only genuine PDF artwork retained as imagery.',
    styles: {
      default: Object.fromEntries([
        ['title', {}],
        ...Array.from({ length: 6 }, (_, index) => [`heading${index + 1}`, {}]),
      ].map(([name]) => [name, {
        run: { color: '000000' },
        paragraph: { spacing: { before: 0, after: 0 } },
      }])),
    },
    sections,
  })
  const blob = await Packer.toBlob(document)
  return new Uint8Array(await blob.arrayBuffer())
}

const SEMANTIC_ROW_HEIGHT = 10
const SEMANTIC_COLUMN_WIDTH_POINTS = 12

function semanticCellStyle(items, { bold = false, wrap = false } = {}) {
  const visible = (items || []).filter((item) => item.visible !== false && item.text?.trim())
  const primary = visible[0] || items?.[0] || {}
  const color = String(primary.color || '1C1710').replace(/^#/, '').toUpperCase()
  const channels = /^[0-9A-F]{6}$/.test(color)
    ? [color.slice(0, 2), color.slice(2, 4), color.slice(4, 6)].map((part) => Number.parseInt(part, 16))
    : [28, 23, 16]
  const lightText = (channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722) > 210
  const sampledBackground = String(primary.backgroundColor || '').replace(/^#/, '').toUpperCase()
  return {
    fontFamily: wordFontName(primary.fontFamily || 'Arial'),
    fontSize: Math.max(5, Math.min(72, Number(primary.fontSize) || 11)),
    color: /^[0-9A-F]{6}$/.test(color) ? color : '1C1710',
    bold: bold || visible.some((item) => item.bold),
    italics: visible.some((item) => item.italics),
    wrap,
    backgroundColor: lightText && /^[0-9A-F]{6}$/.test(sampledBackground) ? sampledBackground : null,
  }
}

function semanticStyleKey(style) {
  return [style.fontFamily, style.fontSize.toFixed(2), style.color, style.backgroundColor || '', style.bold ? 1 : 0, style.italics ? 1 : 0, style.wrap ? 1 : 0].join('|')
}

function semanticWorkbookStyles(pageCells) {
  const styles = []
  const ids = new Map()
  for (const cells of pageCells) {
    for (const cell of cells) {
      const key = semanticStyleKey(cell.style)
      if (!ids.has(key)) {
        ids.set(key, styles.length + 1)
        styles.push(cell.style)
      }
      cell.styleId = ids.get(key)
    }
  }
  const fonts = [
    '<font><sz val="11"/><color rgb="FF1C1710"/><name val="Arial"/><family val="2"/></font>',
    ...styles.map((style) => `<font>${style.bold ? '<b/>' : ''}${style.italics ? '<i/>' : ''}<sz val="${style.fontSize.toFixed(2)}"/><color rgb="FF${style.color}"/><name val="${xmlEscape(style.fontFamily)}"/><family val="2"/></font>`),
  ]
  const fillIds = new Map()
  const fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
  ]
  for (const style of styles) {
    if (!style.backgroundColor) {
      style.fillId = 0
      continue
    }
    if (!fillIds.has(style.backgroundColor)) {
      fillIds.set(style.backgroundColor, fills.length)
      fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="FF${style.backgroundColor}"/><bgColor indexed="64"/></patternFill></fill>`)
    }
    style.fillId = fillIds.get(style.backgroundColor)
  }
  const xfs = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="0"/></xf>',
    ...styles.map((style, index) => `<xf numFmtId="0" fontId="${index + 1}" fillId="${style.fillId}" borderId="0" xfId="0" applyFont="1" applyFill="${style.fillId ? 1 : 0}" applyAlignment="1"><alignment vertical="top" wrapText="${style.wrap ? 1 : 0}"/></xf>`),
  ]
  return `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
}

function semanticPageCells(page) {
  const cells = new Map()
  const setCell = ({ top, left, width, height, value, style }) => {
    const row = Math.floor(Math.max(0, top) / SEMANTIC_ROW_HEIGHT) + 1
    const column = Math.floor(Math.max(0, left) / SEMANTIC_COLUMN_WIDTH_POINTS)
    const safeRow = Math.max(1, Math.min(1_048_576, row))
    const safeColumn = Math.max(0, Math.min(16_383, column))
    const key = `${safeRow}:${safeColumn}`
    const existing = cells.get(key)
    cells.set(key, {
      row: safeRow,
      column: safeColumn,
      value: existing ? `${existing.value}\n${value}` : value,
      width: Math.max(existing?.width || 0, Number(width) || SEMANTIC_COLUMN_WIDTH_POINTS),
      height: Math.max(existing?.height || 0, Number(height) || SEMANTIC_ROW_HEIGHT),
      style: existing && existing.style.fontSize > style.fontSize ? existing.style : style,
    })
  }

  for (const table of page.tables) {
    table.rows.forEach((row) => row.forEach((cell) => {
      setCell({
        top: cell.bounds.top,
        left: cell.bounds.x,
        width: cell.bounds.width,
        height: cell.bounds.height,
        value: cell.text,
        style: semanticCellStyle(cell.items, { bold: cell.header, wrap: true }),
      })
    }))
  }
  for (const line of page.lines) {
    for (const segment of line.segments || [line]) {
      const items = segment.items.filter((item) => !page.tableItemIds.has(item.id))
      if (!items.length) continue
      const heading = /^H[1-6]$/.test(segment.role) || segment.role === 'Title'
      setCell({
        top: segment.top,
        left: segment.x,
        width: segment.width,
        height: segment.height,
        value: segment.text || items.map((item) => item.text).join(''),
        style: semanticCellStyle(items, { bold: heading }),
      })
    }
  }
  return [...cells.values()].sort((a, b) => a.row - b.row || a.column - b.column)
}

function semanticWorksheet(page, cells) {
  const rows = new Map()
  for (const cell of cells) {
    if (!rows.has(cell.row)) rows.set(cell.row, [])
    rows.get(cell.row).push(inlineCell(`${columnName(cell.column)}${cell.row}`, cell.value, cell.styleId))
  }
  const rowXml = [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([row, values]) => `<row r="${row}">${values.join('')}</row>`)
    .join('')
  const maxColumn = Math.max(0, Math.ceil(page.width / SEMANTIC_COLUMN_WIDTH_POINTS), ...cells.map((cell) => cell.column))
  const columns = Array.from({ length: maxColumn + 1 }, (_, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="1.65" customWidth="1"/>`).join('')
  const starts = new Set(cells.map((cell) => `${cell.row}:${cell.column}`))
  const occupied = new Set()
  const merges = []
  for (const cell of cells) {
    const rowSpan = Math.max(1, Math.ceil((cell.height + 2) / SEMANTIC_ROW_HEIGHT))
    const columnSpan = Math.max(1, Math.ceil((cell.width * 1.25 + 4) / SEMANTIC_COLUMN_WIDTH_POINTS))
    let endRow = Math.min(1_048_576, cell.row + rowSpan - 1)
    let endColumn = Math.min(16_383, cell.column + columnSpan - 1)
    for (const other of cells) {
      if (other === cell) continue
      if (other.row > cell.row && other.row <= endRow && other.column >= cell.column && other.column <= endColumn) {
        endRow = Math.max(cell.row, other.row - 1)
      }
      if (other.column > cell.column && other.column <= endColumn && other.row >= cell.row && other.row <= endRow) {
        endColumn = Math.max(cell.column, other.column - 1)
      }
    }
    const rangeKeys = []
    let conflict = false
    for (let row = cell.row; row <= endRow && !conflict; row++) {
      for (let column = cell.column; column <= endColumn; column++) {
        const key = `${row}:${column}`
        if (occupied.has(key) || (key !== `${cell.row}:${cell.column}` && starts.has(key))) {
          conflict = true
          break
        }
        rangeKeys.push(key)
      }
    }
    if (conflict || (endRow === cell.row && endColumn === cell.column)) continue
    rangeKeys.forEach((key) => occupied.add(key))
    merges.push(`${columnName(cell.column)}${cell.row}:${columnName(endColumn)}${endRow}`)
  }
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((range) => `<mergeCell ref="${range}"/>`).join('')}</mergeCells>`
    : ''
  const orientation = page.width > page.height ? 'landscape' : 'portrait'
  return `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0" zoomScale="70"/></sheetViews><sheetFormatPr defaultRowHeight="${SEMANTIC_ROW_HEIGHT}"/><cols>${columns}</cols><sheetData>${rowXml}</sheetData>${mergeXml}<pageMargins left="0.35" right="0.35" top="0.45" bottom="0.45" header="0.2" footer="0.2"/><pageSetup orientation="${orientation}" fitToWidth="1" fitToHeight="1"/></worksheet>`
}

export function semanticPdfPagesToXlsx({ title, pages, metadata = {} }) {
  if (!pages.length) throw new Error('The PDF does not contain any pages.')
  assertEditablePdfPages(pages)
  const sheets = pages.map((page, index) => ({
    name: safeSheetName(`Page ${page.pageNumber || index + 1}`, `Page ${index + 1}`),
    id: index + 1,
    page,
    cells: semanticPageCells(page),
  }))
  const semanticStyles = semanticWorkbookStyles(sheets.map((sheet) => sheet.cells))
  const overrides = [
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    ...sheets.map((sheet) => `<Override PartName="/xl/worksheets/sheet${sheet.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`),
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
  ]
  const files = {
    '[Content_Types].xml': `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides.join('')}</Types>`,
    '_rels/.rels': `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    'docProps/core.xml': `${XML_HEADER}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(metadata.title || title)}</dc:title><dc:subject>${xmlEscape(metadata.subject || 'Editable PDF data conversion')}</dc:subject><dc:creator>${xmlEscape(metadata.author || metadata.creator || 'Massicot')}</dc:creator><dc:description>Native cells reconstructed from PDF text and tables; no page screenshots.</dc:description><cp:lastModifiedBy>Massicot</cp:lastModifiedBy></cp:coreProperties>`,
    'docProps/app.xml': `${XML_HEADER}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Massicot</Application><AppVersion>1.0</AppVersion><TitlesOfParts><vt:vector size="${sheets.length}" baseType="lpstr">${sheets.map((sheet) => `<vt:lpstr>${xmlEscape(sheet.name)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts></Properties>`,
    'xl/workbook.xml': `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((sheet) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${sheet.id}" r:id="rId${sheet.id}"/>`).join('')}</sheets><calcPr calcId="191029"/></workbook>`,
    'xl/_rels/workbook.xml.rels': `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((sheet) => `<Relationship Id="rId${sheet.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sheet.id}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': semanticStyles,
  }
  for (const sheet of sheets) files[`xl/worksheets/sheet${sheet.id}.xml`] = semanticWorksheet(sheet.page, sheet.cells)
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, value]) => [name, strToU8(value)])), { level: 6 })
}
