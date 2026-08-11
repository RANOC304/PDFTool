export function annotationRectangle(annotation, viewport) {
  if (!Array.isArray(annotation.rect) || annotation.rect.length !== 4) return null
  const first = viewport.convertToViewportPoint(annotation.rect[0], annotation.rect[1])
  const second = viewport.convertToViewportPoint(annotation.rect[2], annotation.rect[3])
  const rectangle = [first[0], first[1], second[0], second[1]]
  return {
    x: Math.min(rectangle[0], rectangle[2]),
    top: Math.min(rectangle[1], rectangle[3]),
    width: Math.abs(rectangle[2] - rectangle[0]),
    height: Math.abs(rectangle[3] - rectangle[1]),
  }
}

export async function pdfDestinationPageNumber(doc, destination) {
  try {
    const explicitDestination = typeof destination === 'string'
      ? await doc.getDestination(destination)
      : destination
    if (!Array.isArray(explicitDestination) || !explicitDestination.length) return null
    const reference = explicitDestination[0]
    const pageIndex = Number.isInteger(reference) ? reference : await doc.getPageIndex(reference)
    return Number.isInteger(pageIndex) && pageIndex >= 0 ? pageIndex + 1 : null
  } catch {
    return null
  }
}

function uniqueCoordinates(values, tolerance = 1) {
  const output = []
  for (const value of [...values].sort((a, b) => a - b)) {
    if (!output.length || Math.abs(value - output.at(-1)) > tolerance) output.push(value)
    else output[output.length - 1] = (output.at(-1) + value) / 2
  }
  return output
}

export function vectorTableGrids(operatorList, constructPathOperation) {
  const horizontal = []
  const vertical = []
  for (let index = 0; index < operatorList.fnArray.length; index++) {
    if (operatorList.fnArray[index] !== constructPathOperation) continue
    const values = Array.from(operatorList.argsArray[index]?.[2] || [])
    if (values.length < 4 || !values.slice(0, 4).every(Number.isFinite)) continue
    const [rawX0, rawY0, rawX1, rawY1] = values
    const x0 = Math.min(rawX0, rawX1)
    const x1 = Math.max(rawX0, rawX1)
    const y0 = Math.min(rawY0, rawY1)
    const y1 = Math.max(rawY0, rawY1)
    if (y1 - y0 <= 0.8 && x1 - x0 >= 36) horizontal.push({ x0, x1, y: (y0 + y1) / 2 })
    if (x1 - x0 <= 0.8 && y1 - y0 >= 24) vertical.push({ x: (x0 + x1) / 2, y0, y1 })
  }

  const groups = []
  for (const line of horizontal) {
    let group = groups.find((candidate) =>
      Math.abs(candidate.x0 - line.x0) <= 1.5 && Math.abs(candidate.x1 - line.x1) <= 1.5)
    if (!group) {
      group = { x0: line.x0, x1: line.x1, lines: [] }
      groups.push(group)
    }
    group.lines.push(line)
  }

  const grids = []
  for (const group of groups) {
    const yCoordinates = uniqueCoordinates(group.lines.map((line) => line.y))
    if (yCoordinates.length < 4) continue
    const top = yCoordinates[0]
    const bottom = yCoordinates.at(-1)
    const spanningVerticals = vertical.filter((line) =>
      line.x >= group.x0 - 1.5 && line.x <= group.x1 + 1.5 &&
      line.y0 <= bottom - 2 && line.y1 >= top + 2)
    const covers = (line, rowTop, rowBottom) => line.y0 <= rowTop + 1.5 && line.y1 >= rowBottom - 1.5
    const leftBorder = spanningVerticals.some((line) => Math.abs(line.x - group.x0) <= 1.5 && covers(line, top, bottom))
    const rightBorder = spanningVerticals.some((line) => Math.abs(line.x - group.x1) <= 1.5 && covers(line, top, bottom))
    if (!leftBorder || !rightBorder) continue
    const columns = uniqueCoordinates([
      group.x0,
      group.x1,
      ...spanningVerticals.map((line) => line.x),
    ])
    if (columns.length < 2) continue

    const rows = []
    for (let rowIndex = 0; rowIndex < yCoordinates.length - 1; rowIndex++) {
      const rowTop = yCoordinates[rowIndex]
      const rowBottom = yCoordinates[rowIndex + 1]
      const active = columns.filter((x, columnIndex) =>
        columnIndex === 0 || columnIndex === columns.length - 1 ||
        spanningVerticals.some((line) => Math.abs(line.x - x) <= 1.5 && covers(line, rowTop, rowBottom)))
      const cells = []
      for (let cellIndex = 0; cellIndex < active.length - 1; cellIndex++) {
        const x0 = active[cellIndex]
        const x1 = active[cellIndex + 1]
        const startColumn = columns.findIndex((x) => Math.abs(x - x0) <= 1.5)
        const endColumn = columns.findIndex((x) => Math.abs(x - x1) <= 1.5)
        cells.push({
          x: x0,
          top: rowTop,
          width: x1 - x0,
          height: rowBottom - rowTop,
          columnSpan: Math.max(1, endColumn - startColumn),
        })
      }
      rows.push(cells)
    }
    grids.push({
      bounds: { x: group.x0, top, width: group.x1 - group.x0, height: bottom - top },
      columns,
      columnWidths: columns.slice(1).map((x, index) => x - columns[index]),
      rows,
    })
  }
  return grids
}
