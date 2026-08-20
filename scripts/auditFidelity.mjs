import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strToU8, unzipSync, Zip, ZipPassThrough } from 'fflate'
import { PDFDocument } from 'pdf-lib'
import { initializeCanvas, readPsd, writePsd } from 'ag-psd'
import {
  MAGICK_READY_READERS,
  MAGICK_READY_WRITERS,
  PANDOC_TARGETS,
} from '../src/conversionCapabilities.js'
import {
  CONVERSION_BY_ID,
  CONVERSIONS,
  PRESERVATION_DIMENSIONS,
  PRESERVATION_LEVELS,
} from '../src/conversions.js'
import { assertMagickPrecision, assertMagickResourceLimits, prepareMagickImage } from '../src/lib/magickPolicy.js'
import { base64ToBytes, bytesToBase64, packageOriginalFile } from '../src/lib/binaryEngine.js'
import { csvCell, csvRowsToRecords, detectCsvDelimiter, parseCsv } from '../src/lib/dataEngine.js'
import { semanticPdfPagesToDocx, semanticPdfPagesToXlsx, structuredRowsToXlsx } from '../src/lib/officeEngine.js'
import { nativeTableToPdf, nativeTextToPdf } from '../src/lib/nativePdfWriter.js'
import { annotationRectangle, pdfDestinationPageNumber, vectorTableGrids } from '../src/lib/pdfGeometry.js'
import { repairPdfTextSpacing } from '../src/lib/pdfTextRepair.js'
import { planPdfRasterPage } from '../src/lib/rasterPolicy.js'
import { assertPsdFidelityLimits, flattenPsdLayers } from '../src/lib/psdPolicy.js'
import { convertWithPandoc, safePandocMediaPath } from '../src/lib/pandocEngine.js'

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = join(here, 'fixtures')
const decoder = new TextDecoder()
const onePixelPng = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
))

function namedBlob(parts, name, type) {
  const blob = new Blob(parts, { type })
  Object.defineProperty(blob, 'name', { value: name })
  return blob
}

assert.deepEqual(
  annotationRectangle(
    { rect: [10, 20, 30, 40] },
    { convertToViewportPoint: (x, y) => [x * 2 + 5, 100 - y * 2] },
  ),
  { x: 25, top: 20, width: 40, height: 40 },
  'PDF annotation rectangles must use the PDF.js 6 point-conversion API',
)
assert.equal(
  await pdfDestinationPageNumber({ getPageIndex: async ({ num }) => num - 40 }, [{ num: 42 }, 'XYZ']),
  3,
  'PDF annotation destinations must resolve to one-based Word bookmark pages',
)
const constructPathOperation = 91
const gridLine = (x0, y0, x1, y1) => [20, [], Float32Array.from([x0, y0, x1, y1])]
const vectorGrid = vectorTableGrids({
  fnArray: Array(7).fill(constructPathOperation),
  argsArray: [
    gridLine(10, 20, 210, 20), gridLine(10, 50, 210, 50),
    gridLine(10, 80, 210, 80), gridLine(10, 110, 210, 110),
    gridLine(10, 20, 10, 110), gridLine(90, 20, 90, 110), gridLine(210, 20, 210, 110),
  ],
}, constructPathOperation)
assert.equal(vectorGrid.length, 1, 'PDF vector table grid was not detected')
assert.deepEqual(vectorGrid[0].columnWidths, [80, 120])
assert.deepEqual(vectorGrid[0].rows.map((row) => row.map((cell) => cell.columnSpan)), [[1, 1], [1, 1], [1, 1]])
assert.equal(repairPdfTextSpacing('2. Contr ibution Highlights'), '2. Contribution Highlights')
assert.equal(repairPdfTextSpacing('3. Additional Wor k'), '3. Additional Work')
assert.equal(repairPdfTextSpacing('Project management remains editable'), 'Project management remains editable')

function xml(entries, name) {
  assert(entries[name], `Missing OOXML part: ${name}`)
  return decoder.decode(entries[name])
}

function streamArchive(entries) {
  return new Promise((resolve, reject) => {
    const chunks = []
    const archive = new Zip((error, chunk, final) => {
      if (error) reject(error)
      else {
        chunks.push(chunk)
        if (final) resolve(Buffer.concat(chunks.map((item) => Buffer.from(item))))
      }
    })
    for (const [name, bytes] of entries) {
      const entry = new ZipPassThrough(name)
      archive.add(entry)
      entry.push(bytes, true)
    }
    archive.end()
  })
}

// Every route must declare every preservation dimension with a known level.
for (const conversion of CONVERSIONS) {
  assert.equal(conversion.preservation?.version, 1, `${conversion.id} has no preservation contract`)
  for (const dimension of Object.keys(PRESERVATION_DIMENSIONS)) {
    assert(PRESERVATION_LEVELS[conversion.preservation.dimensions[dimension]], `${conversion.id} has invalid ${dimension}`)
  }
}
assert.equal(CONVERSION_BY_ID['pdf-docx'].preservation.dimensions.layout, 'visual')
assert.equal(CONVERSION_BY_ID['pdf-docx'].preservation.dimensions.structure, 'structured')
assert.equal(CONVERSION_BY_ID['docx-pdf'].availability, 'ready')
assert.equal(CONVERSION_BY_ID['docx-pdf'].handler, 'docx-pdf')
assert.equal(CONVERSION_BY_ID['docx-pdf'].preservation.dimensions.layout, 'visual')
assert.equal(CONVERSION_BY_ID['docx-pdf'].preservation.dimensions.metadata, 'preserved')
assert.equal(CONVERSION_BY_ID['docx-pdf'].qualityGate.policyId, 'docx-pdf')
assert.equal(CONVERSION_BY_ID['pdf-xlsx'].preservation.dimensions.structure, 'structured')
assert.equal(CONVERSION_BY_ID['html-pdf'].preservation.dimensions.structure, 'structured')
assert.equal(CONVERSION_BY_ID['html-pdf'].qualityGate.policyId, 'html')
assert.equal(CONVERSION_BY_ID['svg-pdf'].preservation.dimensions.structure, 'preserved')
assert.equal(CONVERSION_BY_ID['svg-pdf'].qualityGate.policyId, 'svg')
assert.equal(CONVERSION_BY_ID['csv-xlsx'].preservation.dimensions.structure, 'structured')
assert.equal(CONVERSION_BY_ID['pdf->zip'].preservation.dimensions.content, 'exact')
assert.equal(CONVERSION_BY_ID['engine:imagemagick:GIF:gif->webp'].handler, 'imagemagick')
assert.equal(CONVERSION_BY_ID['engine:imagemagick:JPEG:jpg->png'].handler, 'imagemagick')
assert.equal(CONVERSION_BY_ID['engine:pandoc:html:html->docx'].handler, 'pandoc')
assert.equal(CONVERSION_BY_ID['engine:pandoc:docx:docx->html'].handler, 'pandoc')

// The Word fixture combines the editing and layout constructs most likely to
// expose fidelity regressions in either conversion direction.
const officeFixture = unzipSync(await readFile(join(fixtures, 'office-fidelity.docx')))
const officeDocumentXml = xml(officeFixture, 'word/document.xml')
assert.equal((officeDocumentXml.match(/<w:sectPr/g) || []).length, 3, 'Word fixture lost mixed sections')
assert(officeDocumentXml.includes('<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"'), 'Word fixture lost landscape page geometry')
assert(officeDocumentXml.includes('<w:cols w:space="480" w:num="2" w:sep="true"'), 'Word fixture lost two-column layout')
assert(officeDocumentXml.includes('<wp:anchor'), 'Word fixture lost floating artwork')
assert((officeDocumentXml.match(/<w:tbl>/g) || []).length >= 5, 'Word fixture lost complex or nested tables')
assert(officeDocumentXml.includes('<w:numPr>'), 'Word fixture lost real list numbering')
assert(officeDocumentXml.includes('<w:hyperlink'), 'Word fixture lost its hyperlink')
assert(officeDocumentXml.includes('<w:bookmarkStart'), 'Word fixture lost its bookmark')
assert(officeDocumentXml.includes('<m:oMath>') && officeDocumentXml.includes('<m:f>'), 'Word fixture lost its native equation')
assert(xml(officeFixture, 'word/footnotes.xml').includes('editable note content'), 'Word fixture lost its real footnote')
assert.equal(Object.keys(officeFixture).filter((name) => /^word\/header\d+\.xml$/.test(name)).length, 3, 'Word fixture lost section headers')
assert.equal(Object.keys(officeFixture).filter((name) => /^word\/footer\d+\.xml$/.test(name)).length, 3, 'Word fixture lost section footers')

// A real layered PSD round-trip retains its composite pixels and the layer
// properties used by the Word/Excel inventories.
initializeCanvas(
  () => { throw new Error('The PSD fixture unexpectedly requested a canvas.') },
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
)
const solidImage = (rgba) => ({
  width: 2,
  height: 2,
  data: new Uint8ClampedArray([...rgba, ...rgba, ...rgba, ...rgba]),
})
const psdComposite = solidImage([40, 80, 120, 255])
const psdBytes = writePsd({
  width: 2,
  height: 2,
  bitsPerChannel: 8,
  imageData: psdComposite,
  children: [{
    name: 'Artwork group',
    opened: true,
    children: [{
      name: 'Multiply artwork', imageData: solidImage([255, 0, 0, 200]),
      left: 0, top: 0, opacity: 0.75, blendMode: 'multiply', hidden: false,
    }],
  }],
})
const parsedPsd = readPsd(psdBytes, { useImageData: true })
const psdLayers = flattenPsdLayers(parsedPsd.children)
assertPsdFidelityLimits(parsedPsd, psdLayers)
assert.equal(parsedPsd.bitsPerChannel, 8)
assert.deepEqual(parsedPsd.imageData.data, psdComposite.data)
assert.deepEqual(psdLayers, [
  { depth: 0, name: 'Artwork group', type: 'Group', visible: 'Yes', opacity: 100, blendMode: 'pass through', bounds: '0, 0 → 0, 0', text: '' },
  { depth: 1, name: 'Multiply artwork', type: 'Layer', visible: 'Yes', opacity: 75, blendMode: 'multiply', bounds: '0, 0 → 2, 2', text: '' },
])
assert.throws(() => assertPsdFidelityLimits({ width: 2, height: 2, bitsPerChannel: 16 }, []), /stopped instead of reducing/)

// Exact preservation routes round-trip arbitrary bytes and a complete 50-file
// streamed batch without allowing one entry to overwrite another.
const arbitraryBytes = Uint8Array.from([0, 1, 2, 127, 128, 254, 255])
assert.deepEqual(base64ToBytes(bytesToBase64(arbitraryBytes)), arbitraryBytes)
const untouchedZip = unzipSync(packageOriginalFile('authentic.bin', arbitraryBytes))
assert.deepEqual(untouchedZip['authentic.bin'], arbitraryBytes)
const fiftyEntries = Array.from({ length: 50 }, (_, index) => [
  `item-${String(index + 1).padStart(2, '0')}.bin`,
  Uint8Array.from([index, 255 - index]),
])
const streamedEntries = unzipSync(await streamArchive(fiftyEntries))
assert.equal(Object.keys(streamedEntries).length, 50)
for (const [name, bytes] of fiftyEntries) assert.deepEqual(streamedEntries[name], bytes)

const a4Raster = planPdfRasterPage({ width: 595.28, height: 841.89, dpi: 300 })
assert.deepEqual(
  { width: a4Raster.width, height: a4Raster.height, dpi: a4Raster.dpi },
  { width: 2_481, height: 3_508, dpi: 300 },
)
assert.throws(
  () => planPdfRasterPage({ width: 2_000, height: 2_000, dpi: 300, maxPixels: 32_000_000, pageNumber: 7 }),
  /page 7.*was not rendered at a lower resolution/,
)

// Native Office packages: editable Word runs/tables and worksheet cells. A
// screenshot-only page must be rejected rather than passed off as editable.
const metadata = { title: 'Original title', author: 'Original author', subject: 'Original subject', keywords: 'one, two' }
const alphaItem = {
  id: 'alpha', text: 'Alpha editable text', x: 42, top: 52, width: 108, height: 14,
  baseline: 63, fontSize: 12, fontFamily: 'Arial', bold: true, italics: false, color: 'D19C38', visible: true, dir: 'ltr', role: 'H1',
  destinationPageNumber: 1,
}
const gammaItem = {
  id: 'gamma', text: 'Far column', x: 300, top: 52, width: 68, height: 14,
  baseline: 63, fontSize: 12, fontFamily: 'Arial', bold: false, italics: false, color: 'FFFFFF', backgroundColor: '1C170F', visible: true, dir: 'ltr', role: 'P', hasEOL: true,
  link: 'https://example.com/editable-link',
}
const continuationItem = {
  id: 'continuation', text: 'continued in the same editable paragraph', x: 42, top: 67, width: 210, height: 14,
  baseline: 78, fontSize: 12, fontFamily: 'Arial', bold: false, italics: false, color: '000000', visible: true, dir: 'ltr', role: 'P', hasEOL: false,
}
const betaItem = {
  id: 'beta', text: 'Beta cell', x: 42, top: 112, width: 70, height: 12,
  baseline: 122, fontSize: 10, fontFamily: 'Aptos', bold: false, italics: false, dir: 'ltr', role: 'TD',
}
const tableCell = {
  id: 'cell-1', header: true, items: [betaItem], text: 'Beta cell',
  bounds: { x: 42, top: 112, width: 90, height: 20 },
}
const nativePages = [{
  pageNumber: 1, width: 612, height: 792, rotation: 0, language: 'en-US', tagged: true,
  items: [alphaItem, gammaItem, continuationItem, betaItem],
  lines: [
    {
      id: 'line-1', items: [alphaItem, gammaItem], x: 42, top: 52, width: 326, height: 14, role: 'H1',
      text: `${alphaItem.text} Far column`,
      segments: [
        { items: [alphaItem], x: 42, top: 52, width: 108, height: 14, fontSize: 12, role: 'H1', text: alphaItem.text },
        { items: [gammaItem], x: 300, top: 52, width: 68, height: 14, fontSize: 12, role: 'P', text: gammaItem.text },
      ],
    },
    {
      id: 'line-continuation', items: [continuationItem], x: 42, top: 67, width: 210, height: 14, role: 'P',
      text: continuationItem.text,
      segments: [{ items: [continuationItem], x: 42, top: 67, width: 210, height: 14, fontSize: 12, role: 'P', text: continuationItem.text }],
    },
    { id: 'line-2', items: [betaItem], x: 42, top: 112, width: 70, height: 12, role: 'TD', text: betaItem.text },
  ],
  tables: [{
    id: 'table-1', tagged: true, rows: [[tableCell]], bounds: { x: 42, top: 112, width: 90, height: 20 },
    itemIds: new Set(['beta']),
  }],
  tableItemIds: new Set(['beta']),
  graphics: { bytes: onePixelPng, bounds: { x: 0, top: 0, width: 612, height: 792 }, coverage: 1 },
  hasGraphics: true,
  hasRasterGraphics: false,
}]
const docxBytes = await semanticPdfPagesToDocx({ title: 'Fallback', pages: nativePages, metadata })
await writeFile(join(fixtures, 'native-semantic.docx'), docxBytes)
const docx = unzipSync(docxBytes)
const documentXml = xml(docx, 'word/document.xml')
assert.equal(Object.keys(docx).filter((name) => name.startsWith('word/media/') && !name.endsWith('/')).length, 1, 'DOCX lost vector-only non-text artwork')
assert(documentXml.includes('Alpha editable text'), 'DOCX lost native editable text')
assert(documentXml.includes('Far column'), 'DOCX lost a separated same-baseline text segment')
assert(documentXml.includes('continued in the same editable paragraph'), 'DOCX lost a wrapped source line')
assert(!documentXml.includes('<w:framePr'), 'DOCX text was placed in absolute frames instead of editable flow')
assert(documentXml.includes('<wps:wsp'), 'Designed PDF text was not retained in editable positioned Word text boxes')
assert(documentXml.includes('<w:color w:val="D19C38"'), 'DOCX lost the source text colour')
assert(documentXml.includes('<w:tbl>'), 'DOCX lost the native Word table')
assert(documentXml.includes('<w:tblpPr'), 'Designed PDF table lost its source page position')
assert(documentXml.includes('w:name="pdf-page-1"'), 'DOCX lost its page bookmark')
assert(documentXml.includes('w:anchor="pdf-page-1"'), 'DOCX lost an internal PDF link destination')
assert(xml(docx, 'word/_rels/document.xml.rels').includes('https://example.com/editable-link'), 'DOCX lost an external PDF link')
assert(documentXml.includes('w:w="12240"') && documentXml.includes('w:h="15840"'), 'Portrait DOCX page geometry changed')
assert(xml(docx, 'docProps/core.xml').includes('Original author'), 'DOCX metadata was not retained')

const flowAlpha = { ...alphaItem, hasEOL: true, destinationPageNumber: undefined }
const flowPages = [{
  pageNumber: 1, width: 612, height: 792, rotation: 0, language: 'en-US', tagged: true,
  items: [flowAlpha, continuationItem],
  lines: [
    { id: 'flow-1', items: [flowAlpha], x: 42, top: 52, width: 108, height: 14, role: 'P', text: flowAlpha.text, segments: [{ items: [flowAlpha], x: 42, top: 52, width: 108, height: 14, role: 'P', text: flowAlpha.text }] },
    { id: 'flow-2', items: [continuationItem], x: 42, top: 67, width: 210, height: 14, role: 'P', text: continuationItem.text, segments: [{ items: [continuationItem], x: 42, top: 67, width: 210, height: 14, role: 'P', text: continuationItem.text }] },
  ],
  tables: [], tableItemIds: new Set(), graphics: null, hasGraphics: false, hasRasterGraphics: false,
}]
const flowDocx = unzipSync(await semanticPdfPagesToDocx({ title: 'Flow', pages: flowPages, metadata }))
const flowDocumentXml = xml(flowDocx, 'word/document.xml')
assert(!flowDocumentXml.includes('<wps:wsp'), 'Ordinary prose was needlessly converted to positioned text boxes')
assert(
  flowDocumentXml.split('</w:p>').some((paragraph) =>
    paragraph.includes('Alpha editable text') && paragraph.includes('continued in the same editable paragraph')),
  'DOCX did not merge source line wraps into one editable flow paragraph',
)

const signatureItems = [
  { ...continuationItem, id: 'signature-label', text: 'Signature:', x: 42, top: 640, width: 54, hasEOL: true },
  { ...continuationItem, id: 'date-label', text: 'Date of signature:', x: 300, top: 640, width: 88, hasEOL: false },
  { ...continuationItem, id: 'date-value', text: '09/08/2026', x: 460, top: 640, width: 64, hasEOL: false },
]
const signatureLine = {
  id: 'signature-line', items: signatureItems, x: 42, top: 640, width: 482, height: 14, role: 'P',
  text: 'Signature: Date of signature: 09/08/2026',
  segments: signatureItems.map((item) => ({
    items: [item], x: item.x, top: item.top, width: item.width, height: item.height,
    fontSize: item.fontSize, role: 'P', text: item.text,
  })),
}
const sparseArtworkPage = [{
  pageNumber: 1, width: 612, height: 792, rotation: 0, language: 'en-US', tagged: false,
  items: signatureItems, lines: [signatureLine], tables: [], tableItemIds: new Set(),
  graphics: { bytes: onePixelPng, bounds: { x: 120, top: 160, width: 300, height: 220 }, coverage: 0.12 },
  hasGraphics: true, hasRasterGraphics: true,
}]
const sparseArtworkDocx = unzipSync(await semanticPdfPagesToDocx({ title: 'Sparse artwork', pages: sparseArtworkPage, metadata }))
const sparseArtworkXml = xml(sparseArtworkDocx, 'word/document.xml')
assert(!sparseArtworkXml.includes('<wps:wsp'), 'Sparse report artwork forced ordinary editable text into outlined text boxes')
assert.equal((sparseArtworkXml.match(/<w:tab\/>/g) || []).length, 2, 'Separated editable fields lost their native Word tab stops')
assert.equal(Object.keys(sparseArtworkDocx).filter((name) => name.startsWith('word/media/') && !name.endsWith('/')).length, 1, 'Sparse artwork was not retained as one tightly bounded image')

const xlsx = unzipSync(semanticPdfPagesToXlsx({ title: 'Fallback', pages: nativePages, metadata }))
assert.equal(Object.keys(xlsx).filter((name) => name.startsWith('xl/media/')).length, 0, 'Native PDF workbook contains page screenshots')
assert(xml(xlsx, 'xl/workbook.xml').includes('Page 1'))
const semanticSheetXml = xml(xlsx, 'xl/worksheets/sheet1.xml')
const semanticStylesXml = xml(xlsx, 'xl/styles.xml')
assert(semanticSheetXml.includes('Alpha editable text'), 'XLSX lost native page text')
assert(semanticSheetXml.includes('Far column'), 'XLSX collapsed separated same-baseline text')
assert(semanticSheetXml.includes('Beta cell'), 'XLSX lost native table cells')
assert(semanticSheetXml.includes('<mergeCells'), 'XLSX lost source text geometry')
assert(semanticStylesXml.includes('FFD19C38'), 'XLSX lost the source text colour')
assert(semanticStylesXml.includes('FF1C170F'), 'XLSX lost the sampled source background behind light text')
assert(semanticStylesXml.includes('<sz val="12.00"'), 'XLSX lost the source font size')
assert(xml(xlsx, 'docProps/core.xml').includes('Original author'), 'XLSX metadata was not retained')
await assert.rejects(
  () => semanticPdfPagesToDocx({
    title: 'Scan', metadata: {}, pages: [{
      pageNumber: 1, width: 612, height: 792, items: [], lines: [], tables: [], tableItemIds: new Set(),
      graphics: onePixelPng, hasGraphics: true,
    }],
  }),
  /OCR is required/,
)

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
async function extractedPdfText(bytes) {
  const document = await pdfjs.getDocument({ data: bytes.slice(), disableWorker: true }).promise
  const output = []
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    output.push(content.items.map((item) => item.str || '').join(' '))
  }
  await document.destroy?.()
  return output.join('\n')
}
const nativeTextPdf = await nativeTextToPdf('Editable PDF Alpha\nUnicode café', 'Native text fixture')
assert.match(await extractedPdfText(nativeTextPdf), /Editable PDF Alpha/, 'Text PDF contains no selectable source text')
const nativeTablePdf = await nativeTableToPdf([['Name', 'Value'], ['Beta', 42]], 'Native table fixture')
const nativeTableText = await extractedPdfText(nativeTablePdf)
assert.match(nativeTableText, /Beta/, 'Table PDF contains no selectable cell text')
assert.match(nativeTableText, /42/, 'Table PDF lost a native numeric value')

// Structured workbook cells keep JSON numbers/booleans native and serialise nested values.
const jsonWorkbook = unzipSync(structuredRowsToXlsx([
  ['number', 'active', 'nested'],
  [42, true, { value: 7 }],
], { sheetName: 'JSON data' }))
const sheetXml = xml(jsonWorkbook, 'xl/worksheets/sheet1.xml')
assert(/<c r="A2" s="0"><v>42<\/v><\/c>/.test(sheetXml), 'JSON number became text')
assert(/<c r="B2" t="b" s="0"><v>1<\/v><\/c>/.test(sheetXml), 'JSON boolean became text')
assert(sheetXml.includes('{&quot;value&quot;:7}'), 'Nested JSON value was dropped')
const csvRows = parseCsv('name,name\r\n"A, B","line 1\nline 2"\r\n,,extra\r\n\r\n')
const csvRecords = csvRowsToRecords(csvRows)
assert.deepEqual(csvRecords, [
  { name: 'A, B', name_2: 'line 1\nline 2', column_3: '' },
  { name: '', name_2: '', column_3: 'extra' },
  { name: '', name_2: '', column_3: '' },
])
assert.equal(csvCell({ nested: true }), '"{""nested"":true}"')
assert.equal(detectCsvDelimiter('name;city;note\nAubin;Paris;"one; two"'), ';')
assert.deepEqual(parseCsv('name;city\nAubin;Paris'), [['name', 'city'], ['Aubin', 'Paris']])
assert.throws(() => parseCsv('name\n"unfinished'), /not closed/)
assert.throws(
  () => structuredRowsToXlsx([['value'], ['x'.repeat(32_768)]], { sheetName: 'Limit' }),
  /not created with truncated content/,
)

// ImageMagick policy: lossless WebP pixels and explicit Q16 precision refusal.
const magick = await import('@imagemagick/magick-wasm')
await magick.initializeImageMagick(new Uint8Array(await readFile(join(here, '..', 'node_modules', '@imagemagick', 'magick-wasm', 'dist', 'magick.wasm'))))
const ppm = new Uint8Array(await readFile(join(fixtures, 'fidelity.ppm')))
const sourceRgba = magick.ImageMagick.read(ppm, 'PPM', (image) =>
  image.write('RGBA', (bytes) => new Uint8Array(bytes)))
const webp = magick.ImageMagick.readCollection(ppm, 'PPM', (images) => {
  images.forEach((image) => prepareMagickImage(image, 'WEBP', magick))
  return images.write('WEBP', (bytes) => new Uint8Array(bytes))
})
const webpRgba = magick.ImageMagick.read(webp, 'WEBP', (image) =>
  image.write('RGBA', (bytes) => new Uint8Array(bytes)))
assert.deepEqual(webpRgba, sourceRgba, 'Lossless WebP changed decoded pixels')
const xmpProfile = strToU8('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></x:xmpmeta>')
const metadataPng = magick.ImageMagick.read(ppm, 'PPM', (image) => {
  image.comment = 'Massicot metadata fixture'
  image.setProfile('xmp', xmpProfile)
  prepareMagickImage(image, 'PNG', magick)
  return image.write('PNG', (bytes) => new Uint8Array(bytes))
})
const retainedMetadata = magick.ImageMagick.read(metadataPng, 'PNG', (image) => ({
  comment: image.comment,
  xmpBytes: image.getProfile('xmp')?.data,
}))
assert.equal(retainedMetadata.comment, 'Massicot metadata fixture')
assert.deepEqual(retainedMetadata.xmpBytes, xmpProfile)
const animation = magick.MagickImageCollection.create()
const firstFrame = magick.MagickImage.create(magick.MagickColors.Red, 2, 2)
const secondFrame = magick.MagickImage.create(magick.MagickColors.Blue, 2, 2)
firstFrame.animationDelay = 7
firstFrame.animationTicksPerSecond = 100
firstFrame.animationIterations = 3
secondFrame.animationDelay = 13
secondFrame.animationTicksPerSecond = 100
secondFrame.animationIterations = 3
animation.push(firstFrame, secondFrame)
animation.forEach((image) => prepareMagickImage(image, 'WEBP', magick))
const animatedWebp = animation.write('WEBP', (bytes) => new Uint8Array(bytes))
animation.dispose()
const retainedTiming = magick.ImageMagick.readCollection(animatedWebp, 'WEBP', (images) =>
  images.map((image) => [image.animationDelay, image.animationTicksPerSecond, image.animationIterations]))
assert.deepEqual(retainedTiming, [[7, 100, 3], [13, 100, 3]])
const transparent = magick.MagickImage.create(magick.MagickColors.Transparent, 1, 1)
prepareMagickImage(transparent, 'JPEG', magick)
const opaqueJpeg = transparent.write('JPEG', (bytes) => new Uint8Array(bytes))
transparent.dispose()
const opaquePixel = magick.ImageMagick.read(opaqueJpeg, 'JPEG', (image) =>
  image.write('RGBA', (bytes) => new Uint8Array(bytes)))
assert.deepEqual(opaquePixel, Uint8Array.from([255, 255, 255, 255]))
const pgm16 = new Uint8Array(await readFile(join(fixtures, 'fidelity-16bit.pgm')))
assert.throws(
  () => magick.ImageMagick.readCollection(pgm16, 'PGM', (images) =>
    assertMagickPrecision(images, { engineFormat: 'PNG', targetLabel: 'PNG' })),
  /needs a Q16 image engine/,
)
assert.throws(
  () => magick.ImageMagick.readCollection(pgm16, 'PGM', (images) =>
    assertMagickPrecision(images, { engineFormat: 'JPEG', targetLabel: 'JPG' })),
  /cannot retain this source's 16-bit colour precision/,
)
assert.throws(
  () => assertMagickResourceLimits([{ width: 8_001, height: 8_000 }]),
  /It was not resized/,
)
assert.throws(
  () => assertMagickResourceLimits(Array.from({ length: 1_001 }, () => ({ width: 1, height: 1 }))),
  /No frames were omitted/,
)
const expectedFixedGeometry = new Set(['FAX', 'G3', 'HRZ', 'PCD', 'PCDS', 'PDB'])
let magickWriterCount = 0
let magickReaderCount = 0
for (const format of MAGICK_READY_WRITERS) {
  const encoded = magick.ImageMagick.readCollection(ppm, 'PPM', (images) => {
    images.forEach((image) => prepareMagickImage(image, format, magick))
    return images.write(format, (bytes) => new Uint8Array(bytes))
  })
  assert(encoded?.length, `${format} advertised a ready writer but returned no bytes`)
  magickWriterCount++
  if (MAGICK_READY_READERS.has(format)) {
    const size = magick.ImageMagick.read(encoded, format, (image) => ({ width: image.width, height: image.height }))
    const changedGeometry = size.width !== 3 || size.height !== 2
    assert(!changedGeometry || expectedFixedGeometry.has(format), `${format} changed dimensions without a constrained-format contract`)
    magickReaderCount++
  }
}

// Pandoc keeps structural markup and media in DOCX, then emits themed self-contained HTML.
const embeddedImage = Buffer.from(onePixelPng).toString('base64')
const sourceHtml = `<!doctype html><html><body><h1>Designed heading</h1><p><strong>Bold</strong> and <em>italic</em>.</p><img alt="pixel" src="data:image/png;base64,${embeddedImage}"><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table></body></html>`
const pandocDocxResult = await convertWithPandoc(namedBlob([sourceHtml], 'fidelity.html', 'text/html'), {
  engineSource: 'html', engineFormat: 'docx', targetExtension: 'docx', targetLabel: 'DOCX',
  targetMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
})
const pandocDocx = unzipSync(pandocDocxResult.bytes)
assert(xml(pandocDocx, 'word/document.xml').includes('Designed heading'))
assert(Object.keys(pandocDocx).some((name) => name.startsWith('word/media/')), 'Pandoc DOCX lost embedded media')
const pandocHtmlResult = await convertWithPandoc(namedBlob([pandocDocxResult.bytes], 'fidelity.docx', pandocDocxResult.mime), {
  engineSource: 'docx', engineFormat: 'html5', targetExtension: 'html', targetLabel: 'HTML', targetMime: 'text/html',
})
const pandocHtml = decoder.decode(pandocHtmlResult.bytes)
assert(pandocHtml.includes('data:image/'), 'Pandoc HTML is not self-contained')
assert(pandocHtml.includes('--accent:#c7432f'), 'Pandoc HTML theme was not embedded')
const pandocMarkdownResult = await convertWithPandoc(namedBlob([sourceHtml], 'fidelity.html', 'text/html'), {
  engineSource: 'html', engineFormat: 'commonmark_x', targetExtension: 'md', targetLabel: 'MARKDOWN', targetMime: 'text/markdown',
})
assert.equal(pandocMarkdownResult.mime, 'application/zip', 'Markdown media was not packaged')
const pandocMarkdown = unzipSync(pandocMarkdownResult.bytes)
assert(Object.keys(pandocMarkdown).some((name) => name.endsWith('.md')), 'Markdown package lost the document')
assert(Object.keys(pandocMarkdown).some((name) => /\.png$/i.test(name)), 'Markdown package lost extracted media')
const safeMediaPaths = new Set()
const firstSafeMedia = safePandocMediaPath('../../escape/../unsafe?.png', 1, safeMediaPaths)
const secondSafeMedia = safePandocMediaPath('../../escape/../unsafe?.png', 2, safeMediaPaths)
assert(!firstSafeMedia.includes('..') && firstSafeMedia.startsWith('media/'))
assert.notEqual(firstSafeMedia, secondSafeMedia)

const writerSource = `---
title: Writer fidelity fixture
references:
- id: massicot2026
  type: book
  title: Conversion Fidelity
  author:
  - family: Massicot
    given: Atelier
  issued:
    year: 2026
---

# Structured heading

Paragraph with **strong text**, a [link](https://example.com), and a citation [@massicot2026].

- First item
- Second item

| Column A | Column B |
|----------|----------|
| One      | Two      |

![Embedded pixel](data:image/png;base64,${embeddedImage})
`
const writerInput = namedBlob([writerSource], 'writer-fixture.md', 'text/markdown')
const pandocWriterOutputs = new Map()
function unpackPandocDocument(result, extension) {
  if (result.mime !== 'application/zip') return result.bytes
  const entries = unzipSync(result.bytes)
  const match = Object.entries(entries).find(([name]) => name.toLowerCase().endsWith(`.${extension}`))
  assert(match, `Packaged ${extension} output did not contain its document`)
  return match[1]
}
let pandocWriterCount = 0
for (const target of PANDOC_TARGETS.filter((item) => item.availability === 'ready')) {
  const result = await convertWithPandoc(writerInput, {
    engineSource: 'markdown', engineFormat: target.engineFormat,
    targetExtension: target.extension, targetLabel: target.extension.toUpperCase(),
    targetMime: 'application/octet-stream',
  })
  assert(result.bytes?.length, `Pandoc ${target.engineFormat} writer returned no bytes`)
  pandocWriterOutputs.set(target.extension, unpackPandocDocument(result, target.extension))
  pandocWriterCount++
}

const ipynbWriter = await convertWithPandoc(writerInput, {
  engineSource: 'markdown', engineFormat: 'ipynb', targetExtension: 'ipynb', targetLabel: 'IPYNB',
  targetMime: 'application/x-ipynb+json',
})
const readerFixtures = [
  ['docx', 'fixture.docx', pandocWriterOutputs.get('docx')],
  ['html', 'fixture.html', strToU8(sourceHtml)],
  ['csv', 'fixture.csv', strToU8('A,B\n1,2\n')],
  ['docbook', 'fixture.dbk', pandocWriterOutputs.get('dbk')],
  ['epub', 'fixture.epub', pandocWriterOutputs.get('epub')],
  ['ipynb', 'fixture.ipynb', ipynbWriter.bytes],
  ['latex', 'fixture.tex', pandocWriterOutputs.get('tex')],
  ['man', 'fixture.man', pandocWriterOutputs.get('man')],
  ['markdown', 'fixture.md', strToU8(writerSource)],
  ['odt', 'fixture.odt', pandocWriterOutputs.get('odt')],
  ['opml', 'fixture.opml', pandocWriterOutputs.get('opml')],
  ['org', 'fixture.org', pandocWriterOutputs.get('org')],
  ['pptx', 'fixture.pptx', pandocWriterOutputs.get('pptx')],
  ['ris', 'fixture.ris', strToU8('TY  - BOOK\nTI  - Conversion Fidelity\nAU  - Massicot, Atelier\nPY  - 2026\nER  -\n')],
  ['rtf', 'fixture.rtf', pandocWriterOutputs.get('rtf')],
  ['tsv', 'fixture.tsv', strToU8('A\tB\n1\t2\n')],
  ['xlsx', 'fixture.xlsx', structuredRowsToXlsx([['A', 'B'], [1, 2]], { sheetName: 'Fixture' })],
]
let pandocReaderCount = 0
for (const [engineSource, name, bytes] of readerFixtures) {
  assert(bytes?.length, `Missing fixture for Pandoc ${engineSource} reader`)
  const result = await convertWithPandoc(namedBlob([bytes], name, 'application/octet-stream'), {
    engineSource, engineFormat: 'json', targetExtension: 'json', targetLabel: 'JSON',
    targetMime: 'application/json',
  })
  const parsed = JSON.parse(decoder.decode(unpackPandocDocument(result, 'json')))
  assert.equal(parsed['pandoc-api-version']?.length > 0, true, `${engineSource} reader did not produce a Pandoc AST`)
  pandocReaderCount++
}

// The PDF fixture provides different page orientations plus source metadata.
const pdfFixture = await PDFDocument.load(await readFile(join(fixtures, 'fidelity.pdf')))
assert.equal(pdfFixture.getPageCount(), 2)
assert.deepEqual(pdfFixture.getPage(0).getSize(), { width: 595.28, height: 841.89 })
assert.deepEqual(pdfFixture.getPage(1).getSize(), { width: 841.89, height: 595.28 })
assert.equal(pdfFixture.getAuthor(), 'Massicot QA')

console.log(JSON.stringify({
  routesWithContracts: CONVERSIONS.length,
  exactPreservation: { base64RoundTrip: true, zipRoundTrip: true, streamedBatchFiles: 50 },
  office: {
    nativeDocxText: true, nativeDocxTable: true, editableFlowParagraphs: true,
    positionedEditableTextBoxes: true, floatingPositionedTables: true, vectorArtworkLayer: true,
    absoluteTextFrames: 0, nativeXlsxCells: true, nativeXlsxStyling: true,
    pageScreenshots: 0, scanOnlyRefusal: true, metadata: true,
  },
  psd: { compositePixels: true, layerHierarchy: true, layerProperties: true, precisionGuard: true },
  data: {
    typedNumbers: true, typedBooleans: true, nestedValues: true,
    quotedCsv: true, delimiterDetection: true, extraColumns: true,
    malformedCsvRefusal: true, excelLimitRefusal: true,
  },
  nativePdf: { selectableText: true, selectableTableCells: true, unicodeLatin: true },
  imagemagick: {
    losslessWebpPixels: true, metadataProfiles: true, frameTiming: true,
    opaqueFlattening: true, q16Guard: true, writers: magickWriterCount, readers: magickReaderCount,
  },
  pandoc: {
    structure: true, embeddedMedia: true, sidecarMedia: true, safeMediaPaths: true, selfContainedHtml: true,
    embeddedTheme: true, writers: pandocWriterCount, readers: pandocReaderCount,
  },
  pdfFixture: { pages: 2, mixedOrientation: true, metadata: true, noSilentDownscale: true },
}, null, 2))
