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

## Stack

- [React 19](https://react.dev) + [Vite](https://vite.dev)
- [pdf.js](https://mozilla.github.io/pdf.js/) — rendering (thumbnails, compression, image export, text)
- [pdf-lib](https://pdf-lib.js.org/) — PDF writing (extract, merge, rotate, stamp, numbers, metadata)
- [fflate](https://github.com/101arrowz/fflate) — ZIP downloads

## Development

```sh
npm install
npm run dev      # dev server on http://localhost:5173
npm run build    # production build in dist/
npm run preview  # serve the production build locally
```

## Deploying to Vercel

The project is a static Vite site — no server, no environment variables,
no database. [vercel.json](vercel.json) provides the SPA rewrite plus
caching and security headers; Vercel auto-detects the Vite framework
(`npm run build` → `dist/`).

**Via GitHub (recommended):** push this repo to GitHub, then
[import it on Vercel](https://vercel.com/new) — every push to `main`
deploys automatically.

```sh
git remote add origin https://github.com/<you>/massicot.git
git push -u origin main
```

**Via CLI:** `npm i -g vercel && vercel --prod` from the project root.

Because every tool runs client-side, the deployment is pure static
hosting — user PDFs never touch Vercel's servers.

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
