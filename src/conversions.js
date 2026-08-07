const route = (id, source, target, sourceLabel, targetLabel, accept, note) => ({
  id,
  source,
  target,
  sourceLabel,
  targetLabel,
  accept,
  note,
})

export const CONVERSION_GROUPS = [
  {
    id: 'photoshop',
    eyebrow: 'Layered artwork',
    title: 'Photoshop files',
    copy: 'Flatten the artwork for sharing, or turn its layer structure into a useful office document.',
    routes: [
      route('psd-docx', 'psd', 'docx', 'PSD', 'Word', '.psd,image/vnd.adobe.photoshop', 'Creates a Word document with the flattened artwork, document details and layer list.'),
      route('psd-xlsx', 'psd', 'xlsx', 'PSD', 'Excel', '.psd,image/vnd.adobe.photoshop', 'Creates an Excel workbook with document facts and a complete layer inventory.'),
      route('psd-pdf', 'psd', 'pdf', 'PSD', 'PDF', '.psd,image/vnd.adobe.photoshop', 'Places the flattened artwork on a clean PDF page.'),
      route('psd-png', 'psd', 'png', 'PSD', 'PNG', '.psd,image/vnd.adobe.photoshop', 'Exports the flattened composition with lossless image quality.'),
      route('psd-jpg', 'psd', 'jpg', 'PSD', 'JPG', '.psd,image/vnd.adobe.photoshop', 'Exports a compact flattened composition on a white background.'),
      route('psd-webp', 'psd', 'webp', 'PSD', 'WebP', '.psd,image/vnd.adobe.photoshop', 'Exports a compact, web-ready flattened composition.'),
    ],
  },
  {
    id: 'pdf',
    eyebrow: 'Bound pages',
    title: 'PDF documents',
    copy: 'Release pages as images, text, or editable office-friendly extracts.',
    routes: [
      route('pdf-png', 'pdf', 'png', 'PDF', 'PNG set', '.pdf,application/pdf', 'One PNG per page; multi-page documents arrive together in a ZIP.'),
      route('pdf-jpg', 'pdf', 'jpg', 'PDF', 'JPG set', '.pdf,application/pdf', 'One compact JPG per page; multi-page documents arrive together in a ZIP.'),
      route('pdf-txt', 'pdf', 'txt', 'PDF', 'Text', '.pdf,application/pdf', 'Extracts selectable text from every page; scanned pages need OCR first.'),
      route('pdf-docx', 'pdf', 'docx', 'PDF', 'Word', '.pdf,application/pdf', 'Creates a clean Word transcript, divided by page.'),
      route('pdf-xlsx', 'pdf', 'xlsx', 'PDF', 'Excel', '.pdf,application/pdf', 'Places extracted page text into a structured Excel worksheet.'),
    ],
  },
  {
    id: 'images',
    eyebrow: 'Loose images',
    title: 'Image formats',
    copy: 'Move artwork between everyday image formats, or mount a single image as a PDF.',
    routes: [
      route('jpg-png', 'jpg', 'png', 'JPG', 'PNG', '.jpg,.jpeg,image/jpeg', 'Re-encodes the image as a lossless PNG.'),
      route('jpg-webp', 'jpg', 'webp', 'JPG', 'WebP', '.jpg,.jpeg,image/jpeg', 'Makes a compact web-ready copy.'),
      route('jpg-pdf', 'jpg', 'pdf', 'JPG', 'PDF', '.jpg,.jpeg,image/jpeg', 'Mounts the image on a matching PDF page.'),
      route('png-jpg', 'png', 'jpg', 'PNG', 'JPG', '.png,image/png', 'Places transparency on white and makes a compact JPG.'),
      route('png-webp', 'png', 'webp', 'PNG', 'WebP', '.png,image/png', 'Makes a compact web-ready copy while preserving transparency where supported.'),
      route('png-pdf', 'png', 'pdf', 'PNG', 'PDF', '.png,image/png', 'Mounts the image on a matching PDF page.'),
      route('webp-jpg', 'webp', 'jpg', 'WebP', 'JPG', '.webp,image/webp', 'Creates a widely compatible JPG copy.'),
      route('webp-png', 'webp', 'png', 'WebP', 'PNG', '.webp,image/webp', 'Creates a lossless, widely editable PNG copy.'),
      route('webp-pdf', 'webp', 'pdf', 'WebP', 'PDF', '.webp,image/webp', 'Mounts the image on a matching PDF page.'),
      route('gif-png', 'gif', 'png', 'GIF', 'PNG', '.gif,image/gif', 'Captures the first GIF frame as a PNG.'),
      route('gif-pdf', 'gif', 'pdf', 'GIF', 'PDF', '.gif,image/gif', 'Mounts the first GIF frame on a PDF page.'),
      route('bmp-png', 'bmp', 'png', 'BMP', 'PNG', '.bmp,image/bmp', 'Turns a bitmap into a smaller lossless PNG.'),
      route('bmp-pdf', 'bmp', 'pdf', 'BMP', 'PDF', '.bmp,image/bmp', 'Mounts the bitmap on a PDF page.'),
      route('svg-png', 'svg', 'png', 'SVG', 'PNG', '.svg,image/svg+xml', 'Rasterises the vector artwork as a crisp PNG.'),
      route('svg-jpg', 'svg', 'jpg', 'SVG', 'JPG', '.svg,image/svg+xml', 'Rasterises the vector artwork on a white background.'),
      route('svg-pdf', 'svg', 'pdf', 'SVG', 'PDF', '.svg,image/svg+xml', 'Places a high-resolution rendering on a PDF page.'),
    ],
  },
  {
    id: 'copy',
    eyebrow: 'Written matter',
    title: 'Text & documents',
    copy: 'Set plain text and web copy into documents, or lift readable copy out of Word and HTML.',
    routes: [
      route('txt-docx', 'txt', 'docx', 'Text', 'Word', '.txt,text/plain', 'Sets the text into a clean Microsoft Word document.'),
      route('txt-pdf', 'txt', 'pdf', 'Text', 'PDF', '.txt,text/plain', 'Typesets the text across printable PDF pages.'),
      route('txt-html', 'txt', 'html', 'Text', 'HTML', '.txt,text/plain', 'Wraps the text in a simple, readable HTML document.'),
      route('docx-txt', 'docx', 'txt', 'Word', 'Text', '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Extracts readable copy from the Word document.'),
      route('docx-html', 'docx', 'html', 'Word', 'HTML', '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Converts Word headings, paragraphs, lists and tables to clean HTML.'),
      route('html-txt', 'html', 'txt', 'HTML', 'Text', '.html,.htm,text/html', 'Removes markup and keeps the readable copy.'),
      route('html-docx', 'html', 'docx', 'HTML', 'Word', '.html,.htm,text/html', 'Sets the readable copy into a clean Word document.'),
      route('html-pdf', 'html', 'pdf', 'HTML', 'PDF', '.html,.htm,text/html', 'Typesets the readable copy across printable PDF pages.'),
    ],
  },
  {
    id: 'data',
    eyebrow: 'Rows & records',
    title: 'Data files',
    copy: 'Move tabular records between spreadsheet, structured data and printable formats.',
    routes: [
      route('csv-xlsx', 'csv', 'xlsx', 'CSV', 'Excel', '.csv,text/csv', 'Creates a native Excel workbook with a frozen, styled header row.'),
      route('csv-json', 'csv', 'json', 'CSV', 'JSON', '.csv,text/csv', 'Uses the first row as field names and turns every following row into a record.'),
      route('csv-pdf', 'csv', 'pdf', 'CSV', 'PDF', '.csv,text/csv', 'Typesets the table as a readable PDF transcript.'),
      route('json-csv', 'json', 'csv', 'JSON', 'CSV', '.json,application/json', 'Turns an array of records into a spreadsheet-friendly CSV.'),
      route('json-xlsx', 'json', 'xlsx', 'JSON', 'Excel', '.json,application/json', 'Turns an array of records into a native Excel worksheet.'),
      route('json-pdf', 'json', 'pdf', 'JSON', 'PDF', '.json,application/json', 'Typesets the structured data as a readable PDF transcript.'),
    ],
  },
]

export const CONVERSIONS = CONVERSION_GROUPS.flatMap((group) =>
  group.routes.map((item) => ({ ...item, group: group.id })),
)

export const CONVERSION_BY_ID = Object.fromEntries(CONVERSIONS.map((item) => [item.id, item]))

export function reverseForConversion(conversion) {
  return CONVERSIONS.find(
    (candidate) => candidate.source === conversion.target && candidate.target === conversion.source,
  ) ?? null
}

const reversibleIds = new Set()

export const REVERSIBLE_PAIRS = CONVERSIONS.reduce((pairs, conversion) => {
  if (reversibleIds.has(conversion.id)) return pairs
  const reverse = reverseForConversion(conversion)
  if (!reverse) return pairs
  reversibleIds.add(conversion.id)
  reversibleIds.add(reverse.id)
  pairs.push({
    id: [conversion.source, conversion.target].sort().join('-'),
    forward: conversion,
    reverse,
  })
  return pairs
}, [])

export const ONE_WAY_CONVERSION_GROUPS = CONVERSION_GROUPS.map((group) => ({
  ...group,
  routes: group.routes.filter((item) => !reversibleIds.has(item.id)),
}))

export const CONVERSION_CHOICE_COUNT = REVERSIBLE_PAIRS.length
  + ONE_WAY_CONVERSION_GROUPS.reduce((total, group) => total + group.routes.length, 0)

export function conversionsForSource(source) {
  return CONVERSIONS.filter((item) => item.source === source)
}

export const SOURCE_OPTIONS = Array.from(
  new Map(CONVERSIONS.map((item) => [item.source, item.sourceLabel])).entries(),
).map(([value, label]) => ({ value, label }))
