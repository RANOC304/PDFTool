import * as pdfjsLib from 'pdfjs-dist'
import { annotationRectangle, pdfDestinationPageNumber, vectorTableGrids } from './pdfGeometry.js'
import { repairPdfTextSpacing } from './pdfTextRepair.js'

const TEXT_PAINT_OPERATIONS = new Set([
  pdfjsLib.OPS.showText,
  pdfjsLib.OPS.showSpacedText,
  pdfjsLib.OPS.nextLineShowText,
  pdfjsLib.OPS.nextLineSetSpacingShowText,
])

const GRAPHIC_PAINT_OPERATIONS = new Set([
  // PDF.js folds common path construction and its paint operator into one
  // constructPath entry, so omitting this would drop vector backgrounds.
  pdfjsLib.OPS.constructPath,
  pdfjsLib.OPS.stroke,
  pdfjsLib.OPS.closeStroke,
  pdfjsLib.OPS.fill,
  pdfjsLib.OPS.eoFill,
  pdfjsLib.OPS.fillStroke,
  pdfjsLib.OPS.eoFillStroke,
  pdfjsLib.OPS.closeFillStroke,
  pdfjsLib.OPS.closeEOFillStroke,
  pdfjsLib.OPS.shadingFill,
  pdfjsLib.OPS.paintImageMaskXObject,
  pdfjsLib.OPS.paintSolidColorImageMask,
  pdfjsLib.OPS.paintImageXObject,
  pdfjsLib.OPS.paintInlineImageXObject,
  pdfjsLib.OPS.paintImageXObjectRepeat,
  pdfjsLib.OPS.paintImageMaskXObjectRepeat,
  pdfjsLib.OPS.paintFormXObjectBegin,
])

const RASTER_GRAPHIC_OPERATIONS = new Set([
  pdfjsLib.OPS.paintImageMaskXObject,
  pdfjsLib.OPS.paintSolidColorImageMask,
  pdfjsLib.OPS.paintImageXObject,
  pdfjsLib.OPS.paintInlineImageXObject,
  pdfjsLib.OPS.paintImageXObjectRepeat,
  pdfjsLib.OPS.paintImageMaskXObjectRepeat,
])

const HEADING_ROLES = new Set(['H', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'Title'])

function fontFamily(style, fontName, internalFont) {
  const originalName = String(internalFont?.name || '')
    .replace(/^[A-Z]{6}\+/, '')
    .replace(/[-_](?:Bold|Italic|Oblique|Regular|Medium|Semibold|Light|Black).*$/i, '')
  const family = String(originalName || style?.fontFamily || '')
    .split(',')[0]
    .replace(/["']/g, '')
    .trim()
  const combined = `${family} ${fontName || ''} ${internalFont?.fallbackName || ''}`
  if (/helvetica/i.test(combined)) return 'Arial'
  if (/mono|courier|consolas|code/i.test(combined)) return 'Courier New'
  if (/serif|times|georgia|cambria|garamond/i.test(combined)) return 'Times New Roman'
  return family && !/sans-serif|serif|monospace/i.test(family) ? family : 'Arial'
}

function fontTraits(style, fontName, internalFont) {
  const name = `${style?.fontFamily || ''} ${fontName || ''} ${internalFont?.name || ''}`
  return {
    bold: Boolean(internalFont?.bold) || /bold|black|heavy|semibold|demi|medium/i.test(name),
    italics: Boolean(internalFont?.italic) || /italic|oblique|slant/i.test(name),
  }
}

function normalizedColor(value, fallback = '000000') {
  if (typeof value === 'string') return value.replace(/^#/, '').slice(0, 6).toUpperCase()
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const parts = [...value].slice(0, 3).map((part) => {
      const scaled = part <= 1 ? part * 255 : part
      return Math.max(0, Math.min(255, Math.round(scaled))).toString(16).padStart(2, '0')
    })
    if (parts.length === 3) return parts.join('').toUpperCase()
  }
  return fallback
}

function grayColor(args) {
  const value = Array.isArray(args?.[0]) || ArrayBuffer.isView(args?.[0]) ? args[0][0] : args?.[0]
  return normalizedColor([value ?? 0, value ?? 0, value ?? 0])
}

function cmykColor(args) {
  const values = Array.isArray(args?.[0]) || ArrayBuffer.isView(args?.[0]) ? [...args[0]] : [...(args || [])]
  const [cyan = 0, magenta = 0, yellow = 0, black = 0] = values.map((value) => {
    const numeric = Number(value) || 0
    return Math.max(0, Math.min(1, numeric > 1 ? numeric / 255 : numeric))
  })
  return normalizedColor([
    1 - Math.min(1, cyan + black),
    1 - Math.min(1, magenta + black),
    1 - Math.min(1, yellow + black),
  ])
}

function glyphText(value) {
  if (Array.isArray(value)) return value.map(glyphText).join('')
  if (value && typeof value === 'object') return value.unicode || value.fontChar || ''
  return typeof value === 'string' ? value : ''
}

function textPaintStyles(operatorList) {
  const styles = []
  const stack = []
  let state = { color: '000000', fontName: '', fontSize: 10, renderingMode: 0 }
  for (let index = 0; index < operatorList.fnArray.length; index++) {
    const operation = operatorList.fnArray[index]
    const args = operatorList.argsArray[index] || []
    if (operation === pdfjsLib.OPS.save) stack.push({ ...state })
    else if (operation === pdfjsLib.OPS.restore) state = stack.pop() || state
    else if (operation === pdfjsLib.OPS.setFillRGBColor) state.color = normalizedColor(args[0])
    else if (operation === pdfjsLib.OPS.setFillGray) state.color = grayColor(args)
    else if (operation === pdfjsLib.OPS.setFillCMYKColor) state.color = cmykColor(args)
    else if (operation === pdfjsLib.OPS.setFont) state = { ...state, fontName: args[0] || '', fontSize: Math.abs(args[1] || state.fontSize) }
    else if (operation === pdfjsLib.OPS.setTextRenderingMode) state = { ...state, renderingMode: Number(args[0]) || 0 }
    else if (TEXT_PAINT_OPERATIONS.has(operation)) {
      const source = operation === pdfjsLib.OPS.nextLineSetSpacingShowText ? args[2] : args[0]
      styles.push({
        text: glyphText(source),
        color: state.color,
        fontName: state.fontName,
        fontSize: state.fontSize,
        visible: ![3, 7].includes(state.renderingMode),
      })
    }
  }
  return styles
}

function comparablePaintText(value) {
  return String(value || '').replace(/\s+/g, '')
}

function consumePaintStyle(text, styles, cursor) {
  const target = comparablePaintText(text)
  if (!target) return {}

  // Quartz and several Office PDF writers emit one paint operation per glyph
  // while PDF.js combines those glyphs into complete textContent lines. Match
  // the sequential glyph stream, not an arbitrary shared character (which
  // previously made a body line ending in a period inherit the heading colour).
  const startLimit = Math.min(styles.length, cursor.index + 256)
  for (let start = cursor.index; start < startLimit; start++) {
    let assembled = ''
    let firstStyle = null
    const endLimit = Math.min(styles.length, start + Math.max(32, target.length * 3))
    for (let end = start; end < endLimit; end++) {
      const candidate = comparablePaintText(styles[end]?.text)
      if (!candidate) continue
      firstStyle ||= styles[end]
      assembled += candidate
      if (!target.startsWith(assembled) && !assembled.startsWith(target)) break
      if (assembled.length >= target.length) {
        cursor.index = end + 1
        return firstStyle || {}
      }
    }
  }

  const fallback = styles.slice(cursor.index).findIndex((style) => comparablePaintText(style.text))
  if (fallback < 0) return {}
  cursor.index += fallback + 1
  return styles[cursor.index - 1] || {}
}

function buildStructureMap(tree) {
  const content = new Map()
  let sequence = 0

  const visit = (node, path = []) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'content' || node.type === 'object') {
      if (node.id) content.set(node.id, { path })
      return
    }
    const descriptor = {
      id: `structure-${sequence++}`,
      role: node.role || 'Span',
      alt: node.alt || '',
      lang: node.lang || '',
    }
    const nextPath = [...path, descriptor]
    for (const child of node.children || []) visit(child, nextPath)
  }
  visit(tree)
  return content
}

function nearestStructure(path, roles) {
  for (let index = path.length - 1; index >= 0; index--) {
    if (roles.has(path[index].role)) return path[index]
  }
  return null
}

function overlaps(a, b) {
  const horizontal = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const vertical = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top))
  return horizontal * vertical > 0
}

function enrichWithAnnotations(items, annotations, viewport) {
  const links = annotations
    .map((annotation) => ({
      rectangle: annotationRectangle(annotation, viewport),
      url: annotation.url || annotation.unsafeUrl || '',
      destination: annotation.dest || '',
    }))
    .filter((annotation) => annotation.rectangle && (annotation.url || annotation.destination))

  for (const item of items) {
    const link = links.find((candidate) => overlaps(item, candidate.rectangle))
    if (link) {
      item.link = link.url
      item.destination = link.destination
    }
  }

  for (const annotation of annotations) {
    if (!annotation.fieldName || annotation.fieldValue === undefined || annotation.fieldValue === null) continue
    const rectangle = annotationRectangle(annotation, viewport)
    const value = Array.isArray(annotation.fieldValue) ? annotation.fieldValue.join(', ') : String(annotation.fieldValue)
    if (!rectangle || !value || items.some((item) => overlaps(item, rectangle) && item.text.includes(value))) continue
    items.push({
      id: `form-${items.length}`,
      text: value,
      x: rectangle.x,
      top: rectangle.top,
      width: rectangle.width,
      height: Math.max(8, rectangle.height),
      baseline: rectangle.top + rectangle.height * 0.8,
      fontSize: Math.max(8, Math.min(18, rectangle.height * 0.72)),
      fontFamily: 'Aptos',
      bold: false,
      italics: false,
      dir: 'ltr',
      role: 'Form',
      structurePath: [],
      formField: annotation.fieldName,
    })
  }
}

function groupLines(items) {
  const sorted = [...items].sort((a, b) => a.baseline - b.baseline || a.x - b.x)
  const lines = []
  for (const item of sorted) {
    const tolerance = Math.max(1.5, item.fontSize * 0.34)
    let line = lines.findLast((candidate) =>
      Math.abs(candidate.baseline - item.baseline) <= Math.max(tolerance, candidate.fontSize * 0.34))
    if (!line) {
      line = { id: `line-${lines.length}`, items: [], baseline: item.baseline, fontSize: item.fontSize }
      lines.push(line)
    }
    line.items.push(item)
    const count = line.items.length
    line.baseline = ((line.baseline * (count - 1)) + item.baseline) / count
    line.fontSize = Math.max(line.fontSize, item.fontSize)
  }

  return lines.map((line) => {
    line.items.sort((a, b) => a.x - b.x)
    line.x = Math.min(...line.items.map((item) => item.x))
    line.top = Math.min(...line.items.map((item) => item.top))
    const right = Math.max(...line.items.map((item) => item.x + item.width))
    const bottom = Math.max(...line.items.map((item) => item.top + item.height))
    line.width = Math.max(1, right - line.x)
    line.height = Math.max(1, bottom - line.top)
    const roles = line.items.map((item) => item.role).filter(Boolean)
    line.role = roles.find((role) => HEADING_ROLES.has(role)) || roles[0] || 'P'
    line.text = ''
    let previousRight = null
    for (const item of line.items) {
      if (previousRight !== null) {
        const average = Math.max(1, item.fontSize * 0.48)
        const gap = item.x - previousRight
        if (gap > average * 0.3) line.text += ' '.repeat(Math.min(16, Math.max(1, Math.round(gap / average))))
      }
      line.text += item.text
      previousRight = item.x + item.width
    }
    line.segments = []
    let segment = null
    for (const item of line.items) {
      if (!item.text.trim() && item.width > Math.max(12, item.fontSize * 1.1)) {
        segment = null
        continue
      }
      const gap = segment ? item.x - segment.right : 0
      const threshold = Math.max(12, item.fontSize * 1.1, segment?.fontSize ? segment.fontSize * 1.1 : 0)
      if (!segment || gap > threshold) {
        segment = { items: [], x: item.x, top: item.top, right: item.x + item.width, bottom: item.top + item.height, fontSize: item.fontSize }
        line.segments.push(segment)
      }
      segment.items.push(item)
      segment.top = Math.min(segment.top, item.top)
      segment.right = Math.max(segment.right, item.x + item.width)
      segment.bottom = Math.max(segment.bottom, item.top + item.height)
      segment.fontSize = Math.max(segment.fontSize, item.fontSize)
    }
    for (const part of line.segments) {
      part.width = Math.max(1, part.right - part.x)
      part.height = Math.max(1, part.bottom - part.top)
      part.role = part.items.find((item) => HEADING_ROLES.has(item.role))?.role || part.items[0]?.role || line.role
      part.text = part.items.map((item) => item.text).join('')
    }
    return line
  }).sort((a, b) => a.top - b.top || a.x - b.x)
}

function boundsForItems(items) {
  const x = Math.min(...items.map((item) => item.x))
  const top = Math.min(...items.map((item) => item.top))
  const right = Math.max(...items.map((item) => item.x + item.width))
  const bottom = Math.max(...items.map((item) => item.top + item.height))
  return { x, top, width: right - x, height: bottom - top }
}

function taggedTables(items) {
  const tables = new Map()
  for (const item of items) {
    const tableNode = nearestStructure(item.structurePath, new Set(['Table']))
    const rowNode = nearestStructure(item.structurePath, new Set(['TR']))
    const cellNode = nearestStructure(item.structurePath, new Set(['TH', 'TD']))
    if (!tableNode || !rowNode || !cellNode) continue
    if (!tables.has(tableNode.id)) tables.set(tableNode.id, { id: tableNode.id, tagged: true, rows: new Map(), items: [] })
    const table = tables.get(tableNode.id)
    if (!table.rows.has(rowNode.id)) table.rows.set(rowNode.id, { id: rowNode.id, cells: new Map(), items: [] })
    const row = table.rows.get(rowNode.id)
    if (!row.cells.has(cellNode.id)) row.cells.set(cellNode.id, { id: cellNode.id, header: cellNode.role === 'TH', items: [] })
    row.cells.get(cellNode.id).items.push(item)
    row.items.push(item)
    table.items.push(item)
  }

  return [...tables.values()].map((table) => {
    const rows = [...table.rows.values()]
      .map((row) => ({ ...row, bounds: boundsForItems(row.items) }))
      .sort((a, b) => a.bounds.top - b.bounds.top || a.bounds.x - b.bounds.x)
      .map((row) => [...row.cells.values()]
        .map((cell) => ({
          ...cell,
          bounds: boundsForItems(cell.items),
          text: groupLines(cell.items).map((line) => line.text).join('\n'),
        }))
        .sort((a, b) => a.bounds.x - b.bounds.x))
    return { ...table, rows, bounds: boundsForItems(table.items), itemIds: new Set(table.items.map((item) => item.id)) }
  })
}

function vectorTables(items, operatorList, excludedItemIds) {
  return vectorTableGrids(operatorList, pdfjsLib.OPS.constructPath).flatMap((grid, gridIndex) => {
    const rows = grid.rows.map((cells) => cells.map((bounds) => {
      const cellItems = items.filter((item) => {
        if (excludedItemIds.has(item.id) || !item.text.trim()) return false
        const centerX = item.x + Math.min(item.width, bounds.width) / 2
        const centerY = item.top + item.height / 2
        return centerX >= bounds.x - 1 && centerX <= bounds.x + bounds.width + 1 &&
          centerY >= bounds.top - 1 && centerY <= bounds.top + bounds.height + 1
      })
      return {
        bounds,
        columnSpan: bounds.columnSpan,
        items: cellItems,
        text: groupLines(cellItems).map((line) => line.text.trim()).filter(Boolean).join('\n'),
        header: false,
      }
    }))
    const tableItems = rows.flatMap((row) => row.flatMap((cell) => cell.items))
    if (tableItems.length < Math.max(4, rows.length)) return []
    return [{
      id: `vector-table-${gridIndex}`,
      tagged: false,
      rows,
      bounds: grid.bounds,
      columnWidths: grid.columnWidths,
      itemIds: new Set(tableItems.map((item) => item.id)),
    }]
  })
}

function splitLineCells(line) {
  const cells = []
  let current = []
  let previousRight = null
  for (const item of line.items) {
    const gap = previousRight === null ? 0 : item.x - previousRight
    const threshold = Math.max(18, item.fontSize * 1.8)
    if (current.length && gap > threshold) {
      cells.push(current)
      current = []
    }
    current.push(item)
    previousRight = item.x + item.width
  }
  if (current.length) cells.push(current)
  return cells
}

function hasDataShape(rows) {
  if (rows.length < 3) return false
  let dataRows = 0
  for (const row of rows.slice(1)) {
    if (row.slice(1).some((cell) => /(?:^|\s)[+-]?(?:\d+[\d.,]*|\d*\.\d+)(?:\s|$)/.test(cell.text))) dataRows++
  }
  return dataRows >= Math.max(1, Math.ceil((rows.length - 1) * 0.6))
}

function inferredTables(lines, excludedItemIds) {
  const candidates = lines
    .filter((line) => !line.items.some((item) => excludedItemIds.has(item.id)))
    .map((line) => ({ line, cells: splitLineCells(line) }))
  const tables = []
  let index = 0
  while (index < candidates.length) {
    const start = candidates[index]
    if (start.cells.length < 2 || start.cells.length > 12) {
      index++
      continue
    }
    const group = [start]
    let cursor = index + 1
    while (cursor < candidates.length) {
      const candidate = candidates[cursor]
      const previous = group.at(-1)
      if (candidate.cells.length !== start.cells.length) break
      if (candidate.line.top - (previous.line.top + previous.line.height) > Math.max(26, previous.line.height * 2.2)) break
      const aligned = candidate.cells.every((cell, column) => Math.abs(cell[0].x - start.cells[column][0].x) <= 8)
      if (!aligned) break
      group.push(candidate)
      cursor++
    }
    const rows = group.map(({ cells }) => cells.map((items) => ({
      items,
      bounds: boundsForItems(items),
      text: groupLines(items).map((line) => line.text).join(' '),
      header: false,
    })))
    if (group.length >= 3 && hasDataShape(rows)) {
      rows[0].forEach((cell) => { cell.header = true })
      const allItems = rows.flatMap((row) => row.flatMap((cell) => cell.items))
      tables.push({
        id: `inferred-table-${tables.length}`,
        tagged: false,
        rows,
        bounds: boundsForItems(allItems),
        itemIds: new Set(allItems.map((item) => item.id)),
      })
      index = cursor
    } else {
      index++
    }
  }
  return tables
}

async function canvasBlob(canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('The browser could not encode the PDF artwork layer.')
  return new Uint8Array(await blob.arrayBuffer())
}

function sampledBackground(context, canvas, item, scale) {
  const xs = [0.2, 0.5, 0.8]
  const ys = [0.3, 0.65]
  const colors = []
  for (const xRatio of xs) {
    for (const yRatio of ys) {
      const x = Math.max(0, Math.min(canvas.width - 1, Math.round((item.x + item.width * xRatio) * scale)))
      const y = Math.max(0, Math.min(canvas.height - 1, Math.round((item.top + item.height * yRatio) * scale)))
      const [red, green, blue, alpha] = context.getImageData(x, y, 1, 1).data
      const opacity = alpha / 255
      colors.push([
        Math.round(red * opacity + 255 * (1 - opacity)),
        Math.round(green * opacity + 255 * (1 - opacity)),
        Math.round(blue * opacity + 255 * (1 - opacity)),
      ])
    }
  }
  const median = [0, 1, 2].map((channel) =>
    colors.map((color) => color[channel]).sort((a, b) => a - b)[Math.floor(colors.length / 2)])
  return median.map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function cropArtworkCanvas(canvas, context, scale) {
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = image
  const pixelCount = canvas.width * canvas.height
  const cornerOffsets = [
    0,
    (canvas.width - 1) * 4,
    (canvas.height - 1) * canvas.width * 4,
    ((canvas.height - 1) * canvas.width + canvas.width - 1) * 4,
  ]
  const corners = cornerOffsets.map((offset) => [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]])
  const whitePageBackground = corners.every(([red, green, blue, alpha]) =>
    alpha >= 250 && red >= 246 && green >= 246 && blue >= 246)
  const isArtworkPixel = (offset) => {
    const alpha = data[offset + 3]
    if (alpha <= 2) return false
    if (!whitePageBackground) return true
    // Many PDF producers paint an opaque white page rectangle. Treat only
    // near-white pixels as that removable canvas; coloured/black artwork and
    // white details surrounded by real artwork still retain the same bounds.
    return data[offset] < 244 || data[offset + 1] < 244 || data[offset + 2] < 244
  }

  let minX = canvas.width
  let minY = canvas.height
  let maxX = -1
  let maxY = -1
  let artworkPixels = 0
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    if (!isArtworkPixel(pixel * 4)) continue
    artworkPixels++
    const x = pixel % canvas.width
    const y = Math.floor(pixel / canvas.width)
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  if (maxX < minX || maxY < minY) return null
  const padding = Math.max(2, Math.round(scale * 1.5))
  minX = Math.max(0, minX - padding)
  minY = Math.max(0, minY - padding)
  maxX = Math.min(canvas.width - 1, maxX + padding)
  maxY = Math.min(canvas.height - 1, maxY + padding)
  const width = maxX - minX + 1
  const height = maxY - minY + 1
  const cropped = document.createElement('canvas')
  cropped.width = width
  cropped.height = height
  cropped.getContext('2d', { alpha: true }).drawImage(canvas, minX, minY, width, height, 0, 0, width, height)
  return {
    canvas: cropped,
    bounds: { x: minX / scale, top: minY / scale, width: width / scale, height: height / scale },
    coverage: artworkPixels / Math.max(1, width * height),
  }
}

function clearNativeTableGridArtwork(context, tables, scale) {
  for (const table of tables || []) {
    if (!/^vector-table-/.test(table.id || '')) continue
    const xs = new Set()
    const ys = new Set()
    for (const row of table.rows || []) {
      for (const cell of row) {
        xs.add(cell.bounds.x)
        xs.add(cell.bounds.x + cell.bounds.width)
        ys.add(cell.bounds.top)
        ys.add(cell.bounds.top + cell.bounds.height)
      }
    }
    const thickness = Math.max(2, Math.ceil(scale * 1.5))
    const x = Math.round(table.bounds.x * scale)
    const y = Math.round(table.bounds.top * scale)
    const width = Math.ceil(table.bounds.width * scale)
    const height = Math.ceil(table.bounds.height * scale)
    for (const borderX of xs) {
      context.clearRect(Math.round(borderX * scale - thickness / 2), y - thickness, thickness, height + thickness * 2)
    }
    for (const borderY of ys) {
      context.clearRect(x - thickness, Math.round(borderY * scale - thickness / 2), width + thickness * 2, thickness)
    }
  }
}

async function renderGraphicsLayer(page, viewport, operatorList, dpi, { items = [], tables = [], includeBytes = true } = {}) {
  if (!operatorList.fnArray.some((operation) => GRAPHIC_PAINT_OPERATIONS.has(operation))) return null
  const scale = Math.min(dpi / 72, Math.sqrt(24_000_000 / Math.max(1, viewport.width * viewport.height)))
  const renderViewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(renderViewport.width))
  canvas.height = Math.max(1, Math.ceil(renderViewport.height))
  const context = canvas.getContext('2d', { alpha: true })
  context.clearRect(0, 0, canvas.width, canvas.height)
  await page.render({
    canvasContext: context,
    viewport: renderViewport,
    intent: 'print',
    annotationMode: pdfjsLib.AnnotationMode.DISABLE,
    operationsFilter: (index) => !TEXT_PAINT_OPERATIONS.has(operatorList.fnArray[index]),
  }).promise
  for (const item of items) item.backgroundColor = sampledBackground(context, canvas, item, scale)
  clearNativeTableGridArtwork(context, tables, scale)
  // Text paint operations were excluded from the render itself. Clearing each
  // text bounding box here would also erase the genuine vector background
  // beneath that text (for example white lettering on a dark banner).
  const cropped = includeBytes ? cropArtworkCanvas(canvas, context, scale) : null
  const bytes = cropped ? await canvasBlob(cropped.canvas) : null
  cropped?.canvas && (cropped.canvas.width = 0)
  canvas.width = 0
  canvas.height = 0
  return bytes ? { bytes, bounds: cropped.bounds, coverage: cropped.coverage } : null
}

async function semanticPage(page, pageNumber, { includeGraphics, sampleBackgrounds, graphicsDpi }) {
  const viewport = page.getViewport({ scale: 1 })
  const [textContent, structureTree, annotations, operatorList] = await Promise.all([
    page.getTextContent({ includeMarkedContent: true }),
    page.getStructTree().catch(() => null),
    page.getAnnotations({ intent: 'display' }).catch(() => []),
    page.getOperatorList({ intent: 'print', annotationMode: pdfjsLib.AnnotationMode.DISABLE }),
  ])
  const structureMap = buildStructureMap(structureTree)
  const paintStyles = textPaintStyles(operatorList)
  const paintStyleCursor = { index: 0 }
  const items = []
  const markedStack = []

  for (const entry of textContent.items) {
    if (typeof entry.str !== 'string') {
      if (entry.type === 'beginMarkedContent' || entry.type === 'beginMarkedContentProps') markedStack.push(entry.id || null)
      else if (entry.type === 'endMarkedContent') markedStack.pop()
      continue
    }
    if (!entry.str) continue
    const transform = pdfjsLib.Util.transform(viewport.transform, entry.transform)
    const fontSize = Math.max(1, Math.hypot(transform[2], transform[3]) || entry.height || 10)
    const style = textContent.styles[entry.fontName] || {}
    const internalFont = page.commonObjs.get(entry.fontName)
    const ascent = Number.isFinite(style.ascent) ? style.ascent : 0.8
    const x = transform[4]
    const baseline = transform[5]
    const top = baseline - fontSize * ascent
    const markedId = [...markedStack].reverse().find(Boolean)
    const structurePath = structureMap.get(markedId)?.path || []
    const role = structurePath.at(-1)?.role || 'P'
    const repairedText = repairPdfTextSpacing(entry.str)
    const paintStyle = consumePaintStyle(repairedText, paintStyles, paintStyleCursor)
    const traits = fontTraits(style, entry.fontName, internalFont)
    items.push({
      id: `text-${items.length}`,
      text: repairedText,
      x,
      top,
      baseline,
      width: Math.max(0.5, Math.abs(entry.width || 0)),
      height: Math.max(1, fontSize),
      fontSize,
      fontFamily: fontFamily(style, entry.fontName, internalFont),
      bold: traits.bold,
      italics: traits.italics,
      color: paintStyle.color || '000000',
      visible: paintStyle.visible !== false,
      dir: entry.dir || 'ltr',
      role,
      structurePath,
      hasEOL: Boolean(entry.hasEOL),
    })
  }

  enrichWithAnnotations(items, annotations, viewport)
  const lines = groupLines(items)
  const tagged = taggedTables(items)
  const taggedItemIds = new Set(tagged.flatMap((table) => [...table.itemIds]))
  const vector = vectorTables(items, operatorList, taggedItemIds)
  const structuredItemIds = new Set([...taggedItemIds, ...vector.flatMap((table) => [...table.itemIds])])
  const inferred = inferredTables(lines, structuredItemIds)
  const tables = [...tagged, ...vector, ...inferred]
  const tableItemIds = new Set(tables.flatMap((table) => [...table.itemIds]))
  const hasGraphics = operatorList.fnArray.some((operation) => GRAPHIC_PAINT_OPERATIONS.has(operation))
  const hasRasterGraphics = operatorList.fnArray.some((operation) => RASTER_GRAPHIC_OPERATIONS.has(operation))
  const shouldRenderGraphics = (sampleBackgrounds && hasGraphics) || (includeGraphics && hasGraphics)
  const graphics = shouldRenderGraphics
    ? await renderGraphicsLayer(page, viewport, operatorList, graphicsDpi, {
      items,
      tables,
      includeBytes: includeGraphics && hasGraphics,
    })
    : null

  return {
    pageNumber,
    width: viewport.width,
    height: viewport.height,
    rotation: viewport.rotation,
    items,
    lines,
    tables,
    tableItemIds,
    graphics,
    hasGraphics,
    hasRasterGraphics,
    language: textContent.lang || '',
    tagged: Boolean(structureTree),
  }
}

export async function pdfToSemanticPages(doc, { includeGraphics = true, sampleBackgrounds = false, graphicsDpi = 180, onProgress } = {}) {
  const pages = []
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    onProgress?.(pageNumber, doc.numPages)
    const page = await doc.getPage(pageNumber)
    const semantic = await semanticPage(page, pageNumber, { includeGraphics, sampleBackgrounds, graphicsDpi })
    await Promise.all(semantic.items.map(async (item) => {
      if (!item.destination) return
      item.destinationPageNumber = await pdfDestinationPageNumber(doc, item.destination)
    }))
    pages.push(semantic)
  }
  return pages
}
