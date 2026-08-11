import mimeDb from 'mime-db'
import {
  ENGINE_CATALOG,
  MAGICK_DECLARED_READERS,
  MAGICK_READY_READERS,
  MAGICK_TARGETS,
  PANDOC_INPUT_FORMATS,
  PANDOC_TARGETS,
  magickCoderForExtension,
  profilesForExtension,
} from './conversionCapabilities.js'

const route = (
  id,
  source,
  target,
  sourceLabel,
  targetLabel,
  accept,
  note,
  fidelity = 'high',
  options = {},
) => ({
  id,
  source,
  target,
  sourceLabel,
  targetLabel,
  accept,
  note,
  fidelity,
  availability: 'ready',
  ...options,
})

export const FORMATS = {
  pdf: { label: 'PDF', name: 'PDF document', extensions: ['.pdf'], accept: '.pdf,application/pdf', categoryId: 'documents' },
  docx: { label: 'DOCX', name: 'Word document', extensions: ['.docx'], accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', categoryId: 'documents' },
  txt: { label: 'TXT', name: 'Plain text', extensions: ['.txt'], accept: '.txt,text/plain', categoryId: 'code' },
  html: { label: 'HTML', name: 'Web document', extensions: ['.html', '.htm'], accept: '.html,.htm,text/html', categoryId: 'code' },
  jpg: { label: 'JPG', name: 'JPEG image', extensions: ['.jpg', '.jpeg'], accept: '.jpg,.jpeg,image/jpeg', categoryId: 'images' },
  png: { label: 'PNG', name: 'PNG image', extensions: ['.png'], accept: '.png,image/png', categoryId: 'images' },
  webp: { label: 'WEBP', name: 'WebP image', extensions: ['.webp'], accept: '.webp,image/webp', categoryId: 'images' },
  gif: { label: 'GIF', name: 'GIF image', extensions: ['.gif'], accept: '.gif,image/gif', categoryId: 'images' },
  bmp: { label: 'BMP', name: 'Bitmap image', extensions: ['.bmp'], accept: '.bmp,image/bmp', categoryId: 'images' },
  svg: { label: 'SVG', name: 'SVG vector', extensions: ['.svg'], accept: '.svg,image/svg+xml', categoryId: 'images' },
  psd: { label: 'PSD', name: 'Photoshop document', extensions: ['.psd'], accept: '.psd,image/vnd.adobe.photoshop', categoryId: 'artwork' },
  csv: { label: 'CSV', name: 'CSV table', extensions: ['.csv'], accept: '.csv,text/csv', categoryId: 'data' },
  json: { label: 'JSON', name: 'JSON data', extensions: ['.json'], accept: '.json,application/json', categoryId: 'data' },
  any: { label: 'ANY', name: 'Any or future file', extensions: [], accept: '', categoryId: 'future', universal: true },
}

export const FIDELITY = {
  bytePerfect: {
    label: 'Byte-perfect preservation',
    short: 'Exact bytes',
    detail: 'Every source byte is preserved exactly in a reversible package or text representation. No decoding, rendering or metadata rewriting occurs.',
  },
  lossless: {
    label: 'Lossless output',
    short: 'Lossless',
    detail: 'The local encoder retains decoded pixel values, display dimensions and transparency. The preservation contract still exposes metadata or animation limits of the destination.',
  },
  high: {
    label: 'High-fidelity output',
    short: 'High fidelity',
    detail: 'The route uses the strongest practical format-specific policy. Shared capabilities are retained and unavoidable model differences remain visible in the preservation contract below.',
  },
  visual: {
    label: 'Page-faithful visual replica',
    short: 'Visual replica',
    detail: 'The original composition, page size, colour and typography are reproduced as print-quality page artwork. Editing layers and native source objects are intentionally flattened.',
  },
  structured: {
    label: 'Native structured output',
    short: 'Structured',
    detail: 'Rows, fields, values and data types supported by both formats remain native and editable. Format-specific syntax, quoting and unsupported nested types may be normalized.',
  },
  extract: {
    label: 'Content extraction',
    short: 'Extracted content',
    detail: 'Readable content and useful structure are carried across, but the destination cannot reproduce the source layout or editing model exactly.',
  },
  flatten: {
    label: 'Flattened artwork',
    short: 'Flattened',
    detail: 'The visible composition is rendered at high quality. Layers, animation, selectable PDF elements or vector editability are not present in the destination.',
  },
}

export const PRESERVATION_LEVELS = {
  exact: { label: 'Exact', tone: 'strong' },
  preserved: { label: 'Preserved', tone: 'strong' },
  native: { label: 'Native', tone: 'strong' },
  visual: { label: 'Visual match', tone: 'strong' },
  print: { label: 'Print quality', tone: 'strong' },
  structured: { label: 'Structured', tone: 'strong' },
  conditional: { label: 'Where supported', tone: 'medium' },
  reflowed: { label: 'Reflowed', tone: 'medium' },
  restyled: { label: 'Restyled', tone: 'medium' },
  reduced: { label: 'Reduced', tone: 'medium' },
  flattened: { label: 'Flattened', tone: 'medium' },
  lossy: { label: 'Lossy', tone: 'weak' },
  omitted: { label: 'Not carried', tone: 'weak' },
  'not-applicable': { label: 'Not applicable', tone: 'neutral' },
}

export const PRESERVATION_DIMENSIONS = {
  content: 'Content',
  layout: 'Layout',
  theme: 'Theme',
  structure: 'Structure',
  media: 'Media',
  metadata: 'Metadata',
  color: 'Colour',
  animation: 'Animation',
  resolution: 'Resolution',
}

export const QUALITY_GATE_POLICIES = {
  universal: {
    label: 'Exact-byte round trip',
    checks: ['source byte hash', 'reversible decoding', 'filename and extension', '50-file isolation'],
  },
  imagemagick: {
    label: 'Raster and frame fidelity',
    checks: ['decoded pixels', 'dimensions and orientation', 'alpha and colour profile', 'metadata', 'frame count and timing', 'bit depth'],
  },
  pandoc: {
    label: 'Document structure and media',
    checks: ['headings and lists', 'tables and notes', 'embedded media', 'metadata', 'package integrity', 'self-contained resources'],
  },
  pdf: {
    label: 'PDF content and page fidelity',
    checks: ['page count and geometry', 'native editable text', 'real tables and links', 'non-text artwork isolation', 'scan-only refusal', 'source metadata'],
  },
  psd: {
    label: 'Layered-artwork fidelity',
    checks: ['composite dimensions', 'visible composition', 'layer inventory', 'colour precision guard', 'alpha', 'lossless visual encoding'],
  },
  svg: {
    label: 'Vector-render fidelity',
    checks: ['authored viewport', 'native PDF paths and selectable text', 'inline fonts and styles', 'embedded resources', 'alpha', 'external-resource refusal'],
  },
  html: {
    label: 'Native HTML document fidelity',
    checks: ['selectable PDF text', 'headings, lists and tables', 'links and embedded media', 'computed flow styles', 'complex-layout refusal', 'active and external resource refusal'],
  },
  textual: {
    label: 'Text and code fidelity',
    checks: ['Unicode', 'line breaks', 'tabs and indentation', 'long-line wrapping', 'complete pagination', 'monospaced rendering'],
  },
  data: {
    label: 'Structured-data fidelity',
    checks: ['row and field count', 'duplicate headers', 'blank rows', 'native scalar types', 'nested values', 'non-truncating pagination'],
  },
  libreoffice: {
    label: 'Office visual and semantic parity',
    checks: ['rendered-page comparison', 'styles and themes', 'fonts and fallback disclosure', 'charts and embedded media', 'formulas', 'comments and metadata'],
  },
  ffmpeg: {
    label: 'Timed-media fidelity',
    checks: ['stream selection', 'duration and timestamps', 'sample or frame rate', 'colour and HDR metadata', 'audio channels', 'subtitles and chapters'],
  },
  calibre: {
    label: 'Publication fidelity',
    checks: ['chapter order', 'CSS and typography', 'cover and media', 'table of contents', 'footnotes and links', 'publication metadata'],
  },
  gdal: {
    label: 'Geospatial fidelity',
    checks: ['coordinate reference system', 'geotransform', 'extent and resolution', 'nodata and masks', 'bands or fields', 'dataset metadata'],
  },
  sevenzip: {
    label: 'Archive round-trip integrity',
    checks: ['entry byte hashes', 'directory structure', 'filenames and timestamps', 'permissions where supported', 'encrypted-entry handling', 'path safety'],
  },
  assimp: {
    label: '3D scene fidelity',
    checks: ['scene hierarchy', 'mesh topology', 'normals and UVs', 'materials and textures', 'units and transforms', 'animations'],
  },
  openbabel: {
    label: 'Chemical-model fidelity',
    checks: ['atom and bond counts', 'bond orders and aromaticity', 'charges and isotopes', 'stereochemistry', 'coordinates and conformers', 'properties and identifiers'],
  },
  fontforge: {
    label: 'Font fidelity',
    checks: ['glyph coverage', 'outlines and composites', 'metrics and kerning', 'OpenType features', 'naming and metadata', 'variation axes and hinting'],
  },
  fallback: {
    label: 'Format-specific fidelity',
    checks: ['content completeness', 'dimensions or structure', 'metadata', 'package validity', 'round-trip spot check'],
  },
}

const SPECIALIZED_GROUPS = [
  {
    id: 'photoshop',
    routes: [
      route('psd-docx', 'psd', 'docx', 'PSD', 'DOCX', FORMATS.psd.accept, 'Creates a Word document with the flattened artwork, document details and a layer list.', 'extract'),
      route('psd-xlsx', 'psd', 'xlsx', 'PSD', 'XLSX', FORMATS.psd.accept, 'Creates a native, filterable layer inventory with editable text-layer content and document properties; the workbook does not disguise the flattened artwork as cells.', 'extract'),
      route('psd-pdf', 'psd', 'pdf', 'PSD', 'PDF', FORMATS.psd.accept, 'Places the full-size flattened artwork on a matching PDF page.', 'flatten'),
      route('psd-png', 'psd', 'png', 'PSD', 'PNG', FORMATS.psd.accept, 'Exports the flattened composition at its original dimensions with lossless PNG encoding.', 'flatten'),
      route('psd-jpg', 'psd', 'jpg', 'PSD', 'JPG', FORMATS.psd.accept, 'Exports the flattened composition at its original dimensions on a white background.', 'flatten'),
      route('psd-webp', 'psd', 'webp', 'PSD', 'WEBP', FORMATS.psd.accept, 'Exports the flattened composition at its original dimensions with exact lossless WebP encoding.', 'flatten'),
    ],
  },
  {
    id: 'pdf',
    routes: [
      route('pdf-png', 'pdf', 'png', 'PDF', 'PNG', FORMATS.pdf.accept, 'Renders every page at print quality; multiple pages are delivered together in a ZIP.', 'flatten'),
      route('pdf-jpg', 'pdf', 'jpg', 'PDF', 'JPG', FORMATS.pdf.accept, 'Renders every page at print quality, then encodes maximum-quality 4:4:4 JPEG; multiple pages are delivered in a ZIP.', 'flatten'),
      route('pdf-webp', 'pdf', 'webp', 'PDF', 'WEBP', FORMATS.pdf.accept, 'Renders every page at print quality with exact lossless WebP encoding; multiple pages are delivered in a ZIP.', 'flatten'),
      route('pdf-txt', 'pdf', 'txt', 'PDF', 'TXT', FORMATS.pdf.accept, 'Extracts selectable text from every page. Scanned pages need OCR first.', 'extract'),
      route('pdf-docx', 'pdf', 'docx', 'PDF', 'DOCX', FORMATS.pdf.accept, 'Reconstructs real editable Word text, links and tables at the original page geometry; only genuine non-text artwork is retained as imagery. Scan-only pages require OCR first.', 'extract'),
      route('pdf-xlsx', 'pdf', 'xlsx', 'PDF', 'XLSX', FORMATS.pdf.accept, 'Reconstructs embedded PDF text and detected tables as native worksheet cells, one sheet per page. Scan-only pages require OCR first.', 'extract'),
    ],
  },
  {
    id: 'images',
    routes: [
      route('svg-png', 'svg', 'png', 'SVG', 'PNG', FORMATS.svg.accept, 'Rasterises the vector artwork at its authored dimensions as a lossless PNG.', 'flatten'),
      route('svg-jpg', 'svg', 'jpg', 'SVG', 'JPG', FORMATS.svg.accept, 'Rasterises the vector artwork at its authored dimensions on white.', 'flatten'),
      route('svg-webp', 'svg', 'webp', 'SVG', 'WEBP', FORMATS.svg.accept, 'Rasterises the self-contained vector artwork at its authored dimensions with exact lossless WebP encoding.', 'flatten'),
      route('svg-pdf', 'svg', 'pdf', 'SVG', 'PDF', FORMATS.svg.accept, 'Places the self-contained SVG as native vector artwork on a matching PDF page, preserving paths, shapes and selectable text without rasterization.', 'high'),
    ],
  },
  {
    id: 'copy',
    routes: [
      route('txt-docx', 'txt', 'docx', 'TXT', 'DOCX', FORMATS.txt.accept, 'Sets the complete text into a clean Microsoft Word document.', 'extract'),
      route('txt-pdf', 'txt', 'pdf', 'TXT', 'PDF', FORMATS.txt.accept, 'Typesets the complete text across printable PDF pages.', 'extract'),
      route('txt-html', 'txt', 'html', 'TXT', 'HTML', FORMATS.txt.accept, 'Wraps the complete text in a simple, readable HTML document.', 'extract'),
      route('html-pdf', 'html', 'pdf', 'HTML', 'PDF', FORMATS.html.accept, 'Typesets sanitized flow-layout HTML as selectable PDF text with native headings, links, lists, tables and embedded media. Unsupported fixed, transformed, grid or multi-column layouts are refused rather than flattened.', 'extract'),
    ],
  },
  {
    id: 'data',
    routes: [
      route('csv-xlsx', 'csv', 'xlsx', 'CSV', 'XLSX', FORMATS.csv.accept, 'Creates a native Excel workbook with every CSV value preserved as text, measured columns and a frozen, styled header row.', 'structured'),
      route('csv-json', 'csv', 'json', 'CSV', 'JSON', FORMATS.csv.accept, 'Uses unique first-row field names and carries every following row—including blank rows—into records.', 'structured'),
      route('csv-pdf', 'csv', 'pdf', 'CSV', 'PDF', FORMATS.csv.accept, 'Typesets every value in a measured table with repeated headers, wrapped cells, zebra rows and non-truncating pagination.', 'extract'),
      route('json-csv', 'json', 'csv', 'JSON', 'CSV', FORMATS.json.accept, 'Turns compatible records into CSV while serialising nested values explicitly instead of dropping them.', 'structured'),
      route('json-xlsx', 'json', 'xlsx', 'JSON', 'XLSX', FORMATS.json.accept, 'Creates a native Excel worksheet with numbers and booleans retained as typed cells and nested values serialised explicitly.', 'structured'),
      route('json-pdf', 'json', 'pdf', 'JSON', 'PDF', FORMATS.json.accept, 'Maps the structured data into a measured, paginated table without truncating cell values.', 'extract'),
    ],
  },
]

const CATEGORY_DEFINITIONS = [
  { id: 'future', label: 'Any & future extension', description: 'A fallback that accepts every filename', formats: ['any'] },
  { id: 'documents', label: 'Documents & publishing', description: 'Office, page-layout, ebooks and written work', formats: ['pdf', 'docx'] },
  { id: 'images', label: 'Images & graphics', description: 'Photos, bitmap artwork, icons and vectors', formats: ['jpg', 'png', 'webp', 'gif', 'bmp', 'svg'] },
  { id: 'artwork', label: 'Design, 3D & CAD', description: 'Layered artwork, models and technical drawings', formats: ['psd'] },
  { id: 'audio', label: 'Audio', description: 'Music, recordings and sound containers', formats: [] },
  { id: 'video', label: 'Video', description: 'Movies, animation and video containers', formats: [] },
  { id: 'data', label: 'Tables & structured data', description: 'Spreadsheets, databases, records and interchange', formats: ['csv', 'json'] },
  { id: 'code', label: 'Code, text & web', description: 'Source code, markup, configuration and plain text', formats: ['txt', 'html'] },
  { id: 'archives', label: 'Archives & disk images', description: 'Compressed packages, backups and media images', formats: [] },
  { id: 'fonts', label: 'Fonts', description: 'Desktop, web and typesetting fonts', formats: [] },
  { id: 'system', label: 'Applications & system files', description: 'Executables, installers, firmware and runtime data', formats: [] },
  { id: 'other', label: 'Other registered formats', description: 'Scientific, industry and specialist formats', formats: [] },
]

const SPECIALIZED_EXTENSIONS = new Set(
  Object.values(FORMATS).flatMap((format) => format.extensions.map((extension) => extension.slice(1).toLowerCase())),
)

const CODE_EXTENSIONS = new Set([
  'asm', 'c', 'cc', 'clj', 'cljs', 'coffee', 'cpp', 'cs', 'css', 'dart', 'diff', 'elm', 'erl', 'ex', 'exs',
  'fs', 'go', 'h', 'hpp', 'hs', 'ini', 'java', 'js', 'jsx', 'kt', 'kts', 'less', 'lua', 'm', 'md', 'php',
  'pl', 'properties', 'py', 'r', 'rb', 'rs', 'sass', 'scala', 'scss', 'sh', 'sql', 'swift', 'toml', 'ts',
  'tsx', 'vue', 'xml', 'yaml', 'yml',
])

function isTextualMime(mime, extension) {
  return mime.startsWith('text/')
    || CODE_EXTENSIONS.has(extension)
    || /(?:json|xml|yaml|javascript|ecmascript|toml|sql|graphql|x-sh|x-csh)(?:$|\+)/.test(mime)
}

function categoryFor(mime, extension) {
  if (mime.startsWith('image/')) return 'images'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  if (/^application\/(?:mp4|ogg|mpeg4)/.test(mime)) return 'video'
  if (mime.startsWith('font/') || /font|opentype|truetype/.test(mime)) return 'fonts'
  if (mime.startsWith('model/') || /cad|drawing|3d|photoshop|illustrator/.test(mime)) return 'artwork'
  if (/zip|compressed|archive|tar|gzip|bzip|rar|7z|zstd|diskimage|iso9660|apple-diskimage/.test(mime)) return 'archives'
  if (/spreadsheet|excel|database|sqlite|parquet|avro|protobuf|json|csv|tab-separated|sql|yaml/.test(mime)) return 'data'
  if (/document|wordprocessing|presentation|powerpoint|opendocument|epub|postscript|rtf|publisher|visio/.test(mime)) return 'documents'
  if (isTextualMime(mime, extension)) return 'code'
  if (/executable|msdownload|x-msdos-program|firmware|wasm|java-archive|sharedlib|x-mach-binary/.test(mime)) return 'system'
  return 'other'
}

const SOURCE_RANK = { iana: 3, apache: 2, nginx: 1 }
const extensionRecords = new Map()

for (const [mime, metadata] of Object.entries(mimeDb)) {
  for (const rawExtension of metadata.extensions || []) {
    const extension = rawExtension.toLowerCase()
    if (!extension || SPECIALIZED_EXTENSIONS.has(extension)) continue
    const existing = extensionRecords.get(extension)
    if (existing && (SOURCE_RANK[existing.source] || 0) >= (SOURCE_RANK[metadata.source] || 0)) continue
    extensionRecords.set(extension, { extension, mime, source: metadata.source })
  }
}

for (const { extension, mime } of [...extensionRecords.values()].sort((a, b) => a.extension.localeCompare(b.extension))) {
  const id = `ext:${extension}`
  const categoryId = categoryFor(mime, extension)
  FORMATS[id] = {
    label: extension.toUpperCase(),
    name: mime,
    extensions: [`.${extension}`],
    accept: `.${extension},${mime}`,
    mime,
    categoryId,
    generic: true,
  }
  CATEGORY_DEFINITIONS.find((category) => category.id === categoryId).formats.push(id)
}

export const FORMAT_CATEGORIES = CATEGORY_DEFINITIONS

const MIME_BY_EXTENSION = new Map()
for (const [mime, metadata] of Object.entries(mimeDb)) {
  for (const rawExtension of metadata.extensions || []) {
    const extension = rawExtension.toLowerCase()
    const existing = MIME_BY_EXTENSION.get(extension)
    if (!existing || (SOURCE_RANK[metadata.source] || 0) > (SOURCE_RANK[existing.source] || 0)) {
      MIME_BY_EXTENSION.set(extension, { mime, source: metadata.source })
    }
  }
}

const TARGET_LABEL_OVERRIDES = {
  '3g2': '3G2', '3gp': '3GP', adoc: 'ASCIIDOC', ansi: 'ANSI',
  base64: 'BASE64', datauri: 'DATA URI', dbk: 'DOCBOOK',
  fodt: 'FODT', heic: 'HEIC', heif: 'HEIF', html: 'HTML',
  jpeg: 'JPEG', jpg: 'JPG', jp2: 'JP2', json: 'JSON',
  jxl: 'JXL', markdown: 'MARKDOWN', md: 'MARKDOWN',
  pdf: 'PDF', png: 'PNG', pptx: 'PPTX', ps: 'PS',
  svg: 'SVG', tiff: 'TIFF', txt: 'TXT', webp: 'WEBP',
  xlsx: 'XLSX', xml: 'XML', zip: 'ZIP',
}

function targetFacts(extension) {
  const clean = extension.replace(/^\./, '').toLowerCase()
  const registered = Object.values(FORMATS).find((format) =>
    format.extensions.some((candidate) => candidate === `.${clean}`),
  )
  const mime = registered?.mime || MIME_BY_EXTENSION.get(clean)?.mime || 'application/octet-stream'
  return {
    extension: clean,
    label: TARGET_LABEL_OVERRIDES[clean] || clean.toUpperCase(),
    name: registered?.name || mime,
    mime,
  }
}

// Only formats whose configured writer can retain arbitrary decoded Q8 RGB(A)
// samples earn the lossless badge. Palette, monochrome, opaque, fixed-canvas,
// transform and merely "lossless-capable" targets stay conservatively high.
export const MAGICK_LOSSLESS_TARGETS = new Set([
  'farbfeld', 'miff', 'png', 'qoi', 'tiff', 'webp',
])
const FLAT_VECTOR_TARGETS = new Set(['ai', 'eps', 'epsf', 'pdf', 'ps', 'svg', 'svgz'])
const EXTRACT_TARGETS = new Set([
  'ansi', 'bbcode', 'bib', 'csv', 'dbk', 'html', 'json', 'md', 'opml', 'rst', 'rtf',
  'tei', 'tex', 'texi', 'textile', 'txt', 'xml', 'yaml',
])
const MAGICK_FIXED_GEOMETRY_TARGETS = new Set(['fax', 'g3', 'hrz', 'pcd', 'pcds', 'pdb'])

function fidelityForCapability(engine, target) {
  if (engine === 'imagemagick') {
    if (FLAT_VECTOR_TARGETS.has(target)) return 'flatten'
    if (EXTRACT_TARGETS.has(target)) return 'extract'
    return MAGICK_LOSSLESS_TARGETS.has(target) ? 'lossless' : 'high'
  }
  if (engine === 'pandoc') return EXTRACT_TARGETS.has(target) ? 'extract' : 'high'
  if (engine === 'sevenzip') return 'high'
  if (engine === 'fontforge') return 'high'
  return 'high'
}

function engineRoute({
  source,
  format,
  target,
  engine,
  engineFormat,
  engineSource,
  availability,
  profileId,
}) {
  const targetInfo = targetFacts(target)
  const engineInfo = ENGINE_CATALOG[engine]
  const fidelity = fidelityForCapability(engine, targetInfo.extension)
  const isReady = availability === 'ready'
  const readyNotes = {
    imagemagick: `Decodes and re-encodes locally with ${engineInfo.label} at the original dimensions. Metadata and multiple frames are retained when the destination format supports them.`,
    pandoc: `Converts locally with ${engineInfo.label}, preserving supported structure and embedding media in self-contained outputs or packaging it beside text formats. Styling is rebuilt when the document models differ.`,
  }
  let note = isReady
    ? readyNotes[engine]
    : `${engineInfo.label} documents this directional conversion. It is listed for completeness and will become runnable when that engine is connected to the browser runtime.`
  if (isReady && engine === 'pandoc' && targetInfo.extension === 'bib') {
    note = 'Extracts bibliography records carried by the source document. If the source contains no citation data, the route stops instead of producing an empty file.'
  }
  if (isReady && engine === 'imagemagick' && MAGICK_FIXED_GEOMETRY_TARGETS.has(targetInfo.extension)) {
    note = `${targetInfo.label} requires a fixed or aligned raster canvas. ImageMagick preserves the visible content but resamples or pads it to the destination format’s mandatory geometry.`
  }

  return route(
    `engine:${engine}:${profileId || engineSource}:${source}->${targetInfo.extension}`,
    source,
    targetInfo.extension,
    format.label,
    targetInfo.label,
    format.accept,
    note,
    fidelity,
    {
      handler: engine,
      engine,
      engineLabel: engineInfo.label,
      engineVersion: engineInfo.version,
      engineSource,
      engineFormat,
      targetExtension: targetInfo.extension,
      targetMime: targetInfo.mime,
      targetName: targetInfo.name,
      availability,
      provenanceUrl: engineInfo.source,
      profileId,
    },
  )
}

function capabilityRoutesFor(source, format) {
  if (source === 'any' || !format.extensions.length) return []
  const sourceExtensions = format.extensions.map((extension) => extension.slice(1).toLowerCase())
  const routes = []

  // Extension collisions such as TXT (pixel enumeration vs plain text), PFM
  // (portable float map vs font metrics), VST (Targa vs Visio) and PDB (Palm
  // image vs database) cannot be resolved from a filename. Only advertise the
  // raster reader when the catalogue itself classifies the source as imagery.
  const canUseMagickSemanticReader = ['images', 'artwork'].includes(format.categoryId)
    || sourceExtensions.includes('mng')
  const magickSourceExtension = canUseMagickSemanticReader
    ? sourceExtensions.find((extension) => MAGICK_DECLARED_READERS.has(magickCoderForExtension(extension)))
    : null
  if (magickSourceExtension) {
    const engineSource = magickCoderForExtension(magickSourceExtension)
    const sourceReady = MAGICK_READY_READERS.has(engineSource)
    for (const target of MAGICK_TARGETS) {
      if (sourceExtensions.includes(target.extension)) continue
      routes.push(engineRoute({
        source,
        format,
        target: target.extension,
        engine: 'imagemagick',
        engineFormat: target.engineFormat,
        engineSource,
        availability: sourceReady && target.availability === 'ready' ? 'ready' : 'engine-required',
      }))
    }
  }

  const pandocSourceExtension = sourceExtensions.find((extension) => PANDOC_INPUT_FORMATS[extension])
  if (pandocSourceExtension) {
    const engineSource = PANDOC_INPUT_FORMATS[pandocSourceExtension]
    for (const target of PANDOC_TARGETS) {
      if (sourceExtensions.includes(target.extension)) continue
      routes.push(engineRoute({
        source,
        format,
        target: target.extension,
        engine: 'pandoc',
        engineFormat: target.engineFormat,
        engineSource,
        availability: target.availability,
      }))
    }
  }

  const seenProfiles = new Set()
  for (const extension of sourceExtensions) {
    for (const profile of profilesForExtension(extension, format.categoryId)) {
      if (seenProfiles.has(profile.id)) continue
      seenProfiles.add(profile.id)
      for (const target of profile.outputs) {
        if (sourceExtensions.includes(target)) continue
        routes.push(engineRoute({
          source,
          format,
          target,
          engine: profile.engine,
          engineSource: extension,
          engineFormat: target,
          availability: profile.availability,
          profileId: profile.id,
        }))
      }
    }
  }
  return routes
}

const CAPABILITY_ROUTES = Object.entries(FORMATS).flatMap(([source, format]) =>
  capabilityRoutesFor(source, format),
)

function universalRoutesFor(source, format) {
  const label = format.label
  const accept = format.accept
  const routes = [
    route(
      `${source}->zip`, source, 'zip', label, 'ZIP', accept,
      'Packages the untouched original file in a ZIP archive. Its bytes, filename and extension remain exact.',
      'bytePerfect', { handler: 'universal' },
    ),
    route(
      `${source}->base64`, source, 'base64', label, 'BASE64', accept,
      'Encodes every source byte into reversible Base64 text without interpreting or changing the file.',
      'bytePerfect', { handler: 'universal' },
    ),
    route(
      `${source}->datauri`, source, 'datauri', label, 'DATA URI', accept,
      'Creates a self-contained data URI with the complete file encoded byte-for-byte.',
      'bytePerfect', { handler: 'universal', sourceMime: format.mime },
    ),
  ]

  if (format.generic && isTextualMime(format.mime || '', format.extensions[0]?.slice(1) || '')) {
    const readableTargets = [
      ['txt', 'TXT', 'Carries the complete readable source into a plain-text copy.'],
      ['html', 'HTML', 'Wraps the complete readable source in a clean HTML document.'],
      ['pdf', 'PDF', 'Typesets the complete readable source across printable PDF pages.'],
      ['docx', 'DOCX', 'Sets the complete readable source into a Word document.'],
    ]
    for (const [target, targetLabel, note] of readableTargets) {
      if (format.extensions.includes(`.${target}`)) continue
      routes.push(route(
        `${source}->${target}`, source, target, label, targetLabel, accept, note, 'extract', { handler: 'textual' },
      ))
    }
  }
  return routes
}

const UNIVERSAL_ROUTES = Object.entries(FORMATS).flatMap(([source, format]) => universalRoutesFor(source, format))

export const CONVERSION_GROUPS = [
  ...SPECIALIZED_GROUPS,
  { id: 'capabilities', routes: CAPABILITY_ROUTES },
  { id: 'universal', routes: UNIVERSAL_ROUTES },
]

function preservationContractFor(conversion) {
  const dimensions = {
    content: 'conditional',
    layout: 'conditional',
    theme: 'conditional',
    structure: 'conditional',
    media: 'conditional',
    metadata: 'conditional',
    color: 'conditional',
    animation: 'conditional',
    resolution: 'preserved',
  }

  if (conversion.handler === 'universal') {
    Object.keys(dimensions).forEach((key) => { dimensions[key] = 'exact' })
  } else if (conversion.source === 'pdf' && !conversion.engine) {
    if (conversion.target === 'txt') {
      Object.assign(dimensions, {
        content: 'conditional', layout: 'reflowed', theme: 'omitted', structure: 'reduced',
        media: 'omitted', metadata: 'omitted', color: 'not-applicable', animation: 'omitted',
        resolution: 'not-applicable',
      })
    } else if (conversion.target === 'docx') {
      Object.assign(dimensions, {
        content: 'preserved', layout: 'visual', theme: 'conditional', structure: 'structured',
        media: 'preserved', metadata: 'preserved', color: 'conditional', animation: 'omitted',
        resolution: 'print',
      })
    } else if (conversion.target === 'xlsx') {
      Object.assign(dimensions, {
        content: 'conditional', layout: 'structured', theme: 'conditional', structure: 'structured',
        media: 'omitted', metadata: 'preserved', color: 'preserved', animation: 'omitted',
        resolution: 'not-applicable',
      })
    } else {
      Object.assign(dimensions, {
        content: 'visual', layout: 'visual', theme: 'visual', structure: 'flattened',
        media: 'visual', metadata: 'reduced', color: 'visual', animation: 'flattened', resolution: 'print',
      })
    }
  } else if (conversion.source === 'svg' && conversion.target === 'pdf') {
    Object.assign(dimensions, {
      content: 'preserved', layout: 'preserved', theme: 'preserved', structure: 'preserved',
      media: 'preserved', metadata: 'reduced', color: 'conditional', animation: 'omitted',
      resolution: 'not-applicable',
    })
  } else if (conversion.handler === 'imagemagick') {
    Object.assign(dimensions, {
      content: 'visual', layout: 'preserved', theme: 'visual', structure: 'flattened',
      media: 'not-applicable', metadata: 'conditional', color: 'conditional',
      animation: 'conditional', resolution: 'preserved',
    })
    if (MAGICK_FIXED_GEOMETRY_TARGETS.has(conversion.target)) {
      dimensions.layout = 'conditional'
      dimensions.resolution = 'conditional'
    }
  } else if (conversion.handler === 'pandoc') {
    Object.assign(dimensions, {
      content: 'preserved', layout: 'reflowed', theme: 'restyled', structure: 'conditional',
      media: 'preserved', metadata: 'conditional', color: 'not-applicable',
      animation: 'conditional', resolution: 'conditional',
    })
    if (['ansi', 'bbcode', 'bib', 'man', 'txt'].includes(conversion.target)) {
      Object.assign(dimensions, {
        media: 'omitted', metadata: 'reduced', theme: 'omitted', color: 'not-applicable',
        animation: 'omitted', resolution: 'not-applicable',
      })
    }
    if (conversion.target === 'bib') dimensions.content = 'conditional'
  } else if (conversion.engine === 'libreoffice') {
    Object.assign(dimensions, {
      content: 'preserved', layout: 'conditional', theme: 'conditional', structure: 'conditional',
      media: 'conditional', metadata: 'conditional', color: 'conditional',
      animation: 'conditional', resolution: 'conditional',
    })
  } else if (conversion.engine === 'ffmpeg') {
    Object.assign(dimensions, {
      content: 'conditional', layout: 'not-applicable', theme: 'not-applicable', structure: 'conditional',
      media: 'preserved', metadata: 'conditional', color: 'conditional',
      animation: 'conditional', resolution: 'conditional',
    })
  } else if (conversion.engine === 'calibre') {
    Object.assign(dimensions, {
      content: 'preserved', layout: 'reflowed', theme: 'restyled', structure: 'conditional',
      media: 'conditional', metadata: 'conditional', color: 'conditional',
      animation: 'conditional', resolution: 'conditional',
    })
  } else if (conversion.engine === 'gdal') {
    Object.assign(dimensions, {
      content: 'conditional', layout: 'not-applicable', theme: 'not-applicable', structure: 'conditional',
      media: 'not-applicable', metadata: 'conditional', color: 'conditional',
      animation: 'not-applicable', resolution: 'conditional',
    })
  } else if (conversion.engine === 'sevenzip') {
    Object.assign(dimensions, {
      content: 'exact', layout: 'not-applicable', theme: 'not-applicable', structure: 'preserved',
      media: 'not-applicable', metadata: 'conditional', color: 'not-applicable',
      animation: 'not-applicable', resolution: 'not-applicable',
    })
  } else if (conversion.engine === 'assimp') {
    Object.assign(dimensions, {
      content: 'conditional', layout: 'not-applicable', theme: 'conditional', structure: 'conditional',
      media: 'conditional', metadata: 'reduced', color: 'conditional',
      animation: 'conditional', resolution: 'conditional',
    })
  } else if (conversion.engine === 'openbabel') {
    Object.assign(dimensions, {
      content: 'conditional', layout: 'not-applicable', theme: 'not-applicable', structure: 'conditional',
      media: 'not-applicable', metadata: 'conditional', color: 'not-applicable',
      animation: 'not-applicable', resolution: 'conditional',
    })
  } else if (conversion.engine === 'fontforge') {
    Object.assign(dimensions, {
      content: 'conditional', layout: 'conditional', theme: 'not-applicable', structure: 'conditional',
      media: 'not-applicable', metadata: 'conditional', color: 'conditional',
      animation: 'not-applicable', resolution: 'conditional',
    })
  } else if (conversion.source === 'html' && conversion.target === 'pdf') {
    Object.assign(dimensions, {
      content: 'preserved', layout: 'reflowed', theme: 'conditional', structure: 'structured',
      media: 'preserved', metadata: 'reduced', color: 'conditional', animation: 'omitted', resolution: 'preserved',
    })
  } else if (conversion.handler === 'textual' || ['txt', 'html', 'docx'].includes(conversion.source)) {
    Object.assign(dimensions, {
      content: 'preserved', layout: 'reflowed', theme: 'restyled', structure: 'reduced',
      media: conversion.source === 'docx' || conversion.source === 'html' ? 'conditional' : 'not-applicable',
      metadata: 'reduced', color: 'not-applicable', animation: 'omitted', resolution: 'not-applicable',
    })
  } else if (['csv', 'json'].includes(conversion.source)) {
    Object.assign(dimensions, {
      content: 'preserved', layout: 'structured', theme: 'restyled', structure: 'structured',
      media: 'not-applicable', metadata: 'reduced', color: 'not-applicable',
      animation: 'not-applicable', resolution: 'not-applicable',
    })
  } else if (conversion.source === 'psd') {
    Object.assign(dimensions, {
      content: 'visual', layout: 'visual', theme: 'visual', structure: 'flattened',
      media: 'visual', metadata: 'reduced', color: 'conditional', animation: 'flattened', resolution: 'preserved',
    })
  } else if (conversion.fidelity === 'flatten') {
    Object.assign(dimensions, {
      content: 'visual', layout: 'visual', theme: 'visual', structure: 'flattened',
      media: 'visual', metadata: 'reduced', color: 'conditional', animation: 'flattened', resolution: 'preserved',
    })
  } else if (conversion.fidelity === 'extract') {
    Object.assign(dimensions, {
      content: 'preserved', layout: 'reflowed', theme: 'restyled', structure: 'reduced',
      media: 'conditional', metadata: 'reduced', color: 'conditional', animation: 'conditional', resolution: 'conditional',
    })
  }

  return {
    version: 1,
    verification: conversion.availability === 'ready' ? 'local' : 'engine-required',
    dimensions,
  }
}

function qualityGateFor(conversion) {
  let policyId = conversion.engine || conversion.handler
  if (!QUALITY_GATE_POLICIES[policyId]) {
    if (conversion.source === 'pdf') policyId = 'pdf'
    else if (conversion.source === 'psd') policyId = 'psd'
    else if (conversion.source === 'svg') policyId = 'svg'
    else if (conversion.source === 'html' && conversion.target === 'pdf') policyId = 'html'
    else if (['csv', 'json'].includes(conversion.source)) policyId = 'data'
    else if (['txt', 'html', 'docx'].includes(conversion.source)) policyId = 'textual'
    else policyId = 'fallback'
  }
  const policy = QUALITY_GATE_POLICIES[policyId]
  return {
    policyId,
    label: policy.label,
    checks: policy.checks,
    status: conversion.availability === 'ready' ? 'passed' : 'pending',
    evidence: conversion.availability === 'ready' ? 'npm run audit:fidelity' : null,
  }
}

const ALL_CONVERSIONS = CONVERSION_GROUPS.flatMap((group) =>
  group.routes.map((item) => ({
    ...item,
    group: group.id,
    preservation: preservationContractFor(item),
    qualityGate: qualityGateFor(item),
  })),
)

const BEST_CONVERSION_BY_PAIR = new Map()
for (const conversion of ALL_CONVERSIONS) {
  const key = `${conversion.source}\u0000${conversion.target}`
  const existing = BEST_CONVERSION_BY_PAIR.get(key)
  if (!existing || (conversion.availability === 'ready' && existing.availability !== 'ready')) {
    BEST_CONVERSION_BY_PAIR.set(key, conversion)
  }
}

export const CONVERSIONS = [...BEST_CONVERSION_BY_PAIR.values()]

export const CONVERSION_BY_ID = Object.fromEntries(CONVERSIONS.map((item) => [item.id, item]))

const CONVERSIONS_BY_SOURCE = new Map()
for (const conversion of CONVERSIONS) {
  if (!CONVERSIONS_BY_SOURCE.has(conversion.source)) CONVERSIONS_BY_SOURCE.set(conversion.source, [])
  CONVERSIONS_BY_SOURCE.get(conversion.source).push(conversion)
}

const TARGET_PRIORITY = new Map([
  ['pdf', 1], ['png', 2], ['jpg', 3], ['jpeg', 4], ['webp', 5],
  ['docx', 6], ['xlsx', 7], ['pptx', 8], ['txt', 9], ['html', 10],
  ['csv', 11], ['json', 12], ['zip', 13], ['base64', 14], ['datauri', 15],
])

for (const routes of CONVERSIONS_BY_SOURCE.values()) {
  routes.sort((a, b) =>
    Number(b.availability === 'ready') - Number(a.availability === 'ready')
      || (TARGET_PRIORITY.get(a.target) || 1000) - (TARGET_PRIORITY.get(b.target) || 1000)
      || a.targetLabel.localeCompare(b.targetLabel),
  )
}

export function conversionsForSource(source) {
  return CONVERSIONS_BY_SOURCE.get(source) || []
}

export const SOURCE_OPTIONS = FORMAT_CATEGORIES.flatMap((category) =>
  category.formats.map((id) => ({
    value: id,
    label: FORMATS[id].label,
    name: FORMATS[id].name,
    extensions: FORMATS[id].extensions,
    category: category.label,
    categoryId: category.id,
    generic: Boolean(FORMATS[id].generic || FORMATS[id].universal),
  })),
)

export const SOURCE_GROUPS = FORMAT_CATEGORIES.map((category) => ({
  ...category,
  options: SOURCE_OPTIONS.filter((option) => option.categoryId === category.id),
})).filter((category) => category.options.length)

const SOURCE_BY_EXTENSION = new Map()
for (const option of SOURCE_OPTIONS) {
  if (option.value === 'any') continue
  for (const extension of option.extensions) SOURCE_BY_EXTENSION.set(extension.toLowerCase(), option.value)
}
const SORTED_EXTENSIONS = [...SOURCE_BY_EXTENSION.keys()].sort((a, b) => b.length - a.length)

export function sourceForFilename(filename) {
  const lower = filename.toLowerCase()
  const extension = SORTED_EXTENSIONS.find((candidate) => lower.endsWith(candidate))
  return extension ? SOURCE_BY_EXTENSION.get(extension) : null
}

export const KNOWN_EXTENSION_COUNT = SOURCE_BY_EXTENSION.size
export const CONVERSION_CHOICE_COUNT = CONVERSIONS.length
export const READY_CONVERSION_CHOICE_COUNT = CONVERSIONS.filter(
  (conversion) => conversion.availability === 'ready',
).length

export function reverseForConversion(conversion) {
  return CONVERSIONS.find(
    (candidate) => candidate.source === conversion.target && candidate.target === conversion.source,
  ) ?? null
}
