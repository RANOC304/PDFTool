export function detectCsvDelimiter(text) {
  const candidates = [',', ';', '\t', '|']
  const counts = new Map(candidates.map((candidate) => [candidate, 0]))
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') index++
      else quoted = !quoted
    } else if (!quoted && (char === '\n' || char === '\r')) {
      break
    } else if (!quoted && counts.has(char)) {
      counts.set(char, counts.get(char) + 1)
    }
  }
  return candidates.reduce((best, candidate) =>
    counts.get(candidate) > counts.get(best) ? candidate : best, ',')
}

export function parseCsv(text, delimiter = detectCsvDelimiter(text)) {
  if (typeof delimiter !== 'string' || delimiter.length !== 1 || /["\r\n]/.test(delimiter)) {
    throw new Error('CSV delimiter must be one non-quote character.')
  }
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  let afterQuote = false

  const finishCell = () => {
    row.push(cell)
    cell = ''
    afterQuote = false
  }
  const finishRow = () => {
    finishCell()
    rows.push(row)
    row = []
  }

  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"'
        index++
      } else if (char === '"') {
        quoted = false
        afterQuote = true
      } else {
        cell += char
      }
      continue
    }

    if (afterQuote) {
      if (char === delimiter) finishCell()
      else if (char === '\n') finishRow()
      else if (char === '\r' && text[index + 1] === '\n') continue
      else if (char === '\r') finishRow()
      else if (char === ' ' || char === '\t') cell += char
      else throw new Error(`Malformed CSV near character ${index + 1}: text follows a closing quote.`)
      continue
    }

    if (char === '"') {
      if (cell.length) throw new Error(`Malformed CSV near character ${index + 1}: a quoted field must start at the beginning of a cell.`)
      quoted = true
    } else if (char === delimiter) {
      finishCell()
    } else if (char === '\n') {
      finishRow()
    } else if (char === '\r' && text[index + 1] === '\n') {
      // The following LF completes this record.
    } else if (char === '\r') {
      finishRow()
    } else {
      cell += char
    }
  }
  if (quoted) throw new Error('Malformed CSV: the final quoted field is not closed.')
  if (cell || row.length || afterQuote) finishRow()
  return rows
}

export function csvCell(value) {
  const text = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function jsonRows(value) {
  if (Array.isArray(value)) {
    if (!value.length) return [['Value']]
    if (value.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
      const headers = [...new Set(value.flatMap((item) => Object.keys(item)))]
      return [headers, ...value.map((item) => headers.map((header) => item[header] ?? ''))]
    }
    return [['Value'], ...value.map((item) => [item])]
  }
  if (value && typeof value === 'object') return [['Key', 'Value'], ...Object.entries(value)]
  return [['Value'], [value]]
}

export function csvRowsToRecords(rows) {
  const [sourceHeaders = [], ...body] = rows
  const columnCount = Math.max(sourceHeaders.length, ...body.map((row) => row.length), 0)
  const counts = new Map()
  const uniqueHeaders = Array.from({ length: columnCount }, (_, index) => {
    const base = String(sourceHeaders[index] || `column_${index + 1}`)
    const count = (counts.get(base) || 0) + 1
    counts.set(base, count)
    return count === 1 ? base : `${base}_${count}`
  })
  return body.map((row) => Object.fromEntries(
    uniqueHeaders.map((header, index) => [header, row[index] ?? '']),
  ))
}
