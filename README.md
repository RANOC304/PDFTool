# Massicot — PDF Atelier

A local-first web app for working with PDFs. Everything runs in the browser —
files are never uploaded anywhere.

*Massicot* (French): the guillotine blade used in print shops to cut paper stacks.

## Tools

| Nº  | Tool           | What it does                                                        |
| --- | -------------- | ------------------------------------------------------------------- |
| 001 | The Separator  | Copy only the pages you select into a new PDF                       |
| 002 | The Binder     | Merge several PDFs into one, in the order you set                   |
| 003 | The Press      | Compress by re-photographing pages (lossy; text not selectable)     |
| 004 | The Turntable  | Rotate pages — per page or all at once                              |
| 005 | The Stamp      | Text watermark on every page (placement, colour, size, opacity)     |
| 006 | The Composer   | Reorder (drag & drop), duplicate, or remove pages                   |
| 007 | The Guillotine | Split into parts — every page or every N pages — as a ZIP           |
| 008 | The Album      | Bind images (PNG/JPEG/WebP/GIF/BMP) into a single PDF               |
| 009 | The Darkroom   | Export every page as PNG or JPEG, zipped                            |
| 010 | The Typesetter | Add page numbers (position, style, start number)                    |
| 011 | The Scribe     | Extract all text into a .txt (needs a text layer — no OCR)          |
| 012 | The Ledger     | Edit metadata: title, author, subject, keywords                     |

Common conventions: drop a file (or click to browse), adjust, then the red
action button downloads a **new copy** — originals are never modified.
Password-protected PDFs are rejected with a clear message.

## Conversion desk

One unified **From → To** workbench covers every extension in the bundled MIME
registry (currently 1,239), plus an unrestricted custom/future-extension
fallback. Its directional compatibility graph is generated from versioned
reader/writer, demuxer/muxer, importer/exporter and pack/unpack capabilities;
the current audit contains 23,000+ unique source/target-extension pairs.

Ready local routes are always shown first. Researched routes that require a
specialist engine are also visible, but are explicitly labelled and cannot be
run until that engine is connected—an advertised capability is never silently
passed to the wrong converter. Every registered or custom extension still has
byte-perfect ZIP, Base64 and data-URI preservation routes. Unknown extensions
can be typed directly or auto-detected when dropped.

Up to 50 files of the selected source type can be queued at once. A single
successful conversion downloads directly; multi-file batches are delivered in
one ZIP, with per-file progress and errors so one damaged file does not discard
the successful results.

- PSD → Word: flattened artwork plus document details and a layer inventory
- PSD → Excel: document facts and structured layer data
- PSD → PDF / PNG / JPG / WebP
- PDF → PNG / JPG / WebP / TXT / Word / Excel
- JPG / PNG / WebP / GIF / BMP / SVG → every compatible image or PDF format
- Word / HTML / TXT → readable document and text formats
- CSV / JSON → Excel, structured data and printable PDF

Conversions run in the browser and download a new copy. The workbench labels
each route as lossless, high-fidelity, flattened, or extracted content. It
never silently reduces image dimensions: images beyond the safe 64-megapixel
browser limit are rejected unchanged. The two PSD office routes preserve useful
visual or structural information; they do not turn Photoshop layers into
editable Word or Excel artwork.

Each route also carries a nine-part preservation contract for content, layout,
theme, structure, media, metadata, colour, animation and resolution. Runnable
routes must pass their engine-specific quality gate; unconnected specialist
engines remain locked behind a pending activation gate.

DOCX → PDF uses LibreOffice Writer compiled to WebAssembly in browsers that
support isolated WebAssembly threads. Writer performs the pagination and native
PDF export, so mixed page sizes, headers, footers, notes, tables, drawings,
searchable text, vectors, links and metadata remain part of the PDF model. The
large office runtime is downloaded on first use and then reused; document bytes
stay in the browser. Embedded webviews that disable thread isolation use the
audited 288-DPI page renderer with a searchable text layer instead.

PDF → DOCX reconstructs positioned native text, links and detected tables while
keeping only genuine non-text artwork as imagery. Designed pages use editable
DrawingML text boxes at source coordinates; normal prose stays in reflowable
Word paragraphs, and detected tables remain editable cells. Vector-only artwork
is retained, mixed page geometry is preserved, and scan-only pages are refused
until OCR is available. Because PDF stores painted page geometry rather than the
original Word editing semantics, no converter can recover information that is
absent from the PDF; the route preserves what can be proved instead of silently
inventing structure.

PDF-to-Excel reconstructs editable cells on one worksheet per page with source
geometry, typography and colour. HTML-to-PDF produces native selectable text,
headings, links, lists and tables, and refuses complex layouts instead of
disguising page screenshots as document content. SVG-to-PDF keeps the source as
vector artwork. Lossy image targets use explicit maximum-quality encoder
policies.

The browser-ready compatibility engines are ImageMagick WASM for raster/image
coders and Pandoc WASM for documents, markup and publishing formats. The graph
also records directional capabilities from FFmpeg, LibreOffice, Calibre,
7-Zip, Assimp, Open Babel, GDAL/OGR and FontForge; those routes are marked as
engine-required until an equivalent local runtime is bundled.

## Stack

- [React 19](https://react.dev) + [Vite](https://vite.dev)
- [pdf.js](https://mozilla.github.io/pdf.js/) — rendering (thumbnails, compression, image export, text)
- [pdf-lib](https://pdf-lib.js.org/) — PDF writing (extract, merge, rotate, stamp, numbers, metadata)
- [fflate](https://github.com/101arrowz/fflate) — ZIP downloads
- [mime-db](https://github.com/jshttp/mime-db) — maintained MIME and extension catalogue
- [ImageMagick WASM](https://github.com/dlemstra/magick-wasm) — local image decoding and encoding
- [Pandoc WASM](https://github.com/pandoc/pandoc-wasm) — local document and markup conversion
- [pdfmake](https://pdfmake.github.io/docs/) — native selectable text, table, HTML-flow and SVG PDF writing
- [ZetaJS](https://github.com/allotropia/zetajs) + LibreOffice WASM — local Writer-native DOCX → PDF export
- [docx-renderer](https://github.com/recon-vcs/docx-renderer) — isolated-webview DOCX page-render fallback

## Development

Install Node.js 22.13 or later. The fidelity audit generates its own PDF and Word samples from the synthetic fixtures included here.

```sh
npm ci
npm run dev      # dev server on http://localhost:5173
npm run build    # production build in dist/
npm run preview  # serve the production build locally
npm run audit:conversions  # validate the full route graph and quality gates
npm run audit:fidelity     # exercise document, data, PDF and image fixtures
npm run audit:deployment   # verify the production assets and hosting headers
```

## Deploying to Vercel

The project is a static Vite site — no server, no environment variables,
no database. [vercel.json](vercel.json) explicitly publishes the Vite
`dist/` directory and provides security headers. The interface does not use
URL-based client routing, so asset requests are never rewritten to HTML.

**Via GitHub (recommended):** push this repo to GitHub, then
[import it on Vercel](https://vercel.com/new) — every push to `main`
deploys automatically.

```sh
git remote add origin https://github.com/<you>/massicot.git
git push -u origin main
```

**Via CLI:** `npm i -g vercel && vercel --prod` from the project root.

Because every tool runs client-side, the deployment is pure static hosting —
user documents never touch Vercel's servers. The configured COOP/COEP response
headers are required for LibreOffice's WebAssembly threads; do not remove them.

## Architecture

- `src/tools.js` — tool registry (id, number, name, description, status)
- `src/App.jsx` — maps tool ids to components
- `src/lib/pdfEngine.js` — all PDF operations (pure functions, UI-free)
- `src/components/ToolShell.jsx` — shared kit: `ToolShell` (header/errors),
  `Dropzone`, `ActionBar`, `usePdfDoc` (load + progressive thumbnails),
  `useJob` (busy/saved/error handling)
- `src/components/<Tool>.jsx` — one component per tool

### Adding a new tool

1. Add the operation to `src/lib/pdfEngine.js`.
2. Create `src/components/NewTool.jsx` using the shared kit.
3. Register it in `src/tools.js` and in the component map in `src/App.jsx`.

Note: pdf.js rendering uses `intent: 'print'` so thumbnails keep rendering
when the tab is hidden or backgrounded — don't remove that flag.

## Contributing and license

See the [contributor guide](CONTRIBUTING.md) for bug reports and pull requests. Massicot's original code is available under the [MIT License](LICENSE). [Third-party notices](THIRD_PARTY_NOTICES.md) cover external dependencies, runtimes, and fonts.
