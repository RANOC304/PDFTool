import { useState } from 'react'
import { mergePdfs, pdfPageCount, downloadBytes, formatBytes, isPdfFile, baseName } from '../lib/pdfEngine.js'
import { ToolShell, Dropzone, ActionBar, CountInfo, useJob } from './ToolShell.jsx'

let nextId = 1

export default function Binder({ onBack }) {
  const [files, setFiles] = useState([]) // { id, name, size, pages, bytes }
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const job = useJob(setError)

  async function addFiles(list) {
    setError(null)
    setLoading(true)
    const rejected = []
    const added = []
    for (const f of list) {
      if (!isPdfFile(f)) {
        rejected.push(f.name)
        continue
      }
      try {
        const bytes = new Uint8Array(await f.arrayBuffer())
        const pages = await pdfPageCount(bytes)
        added.push({ id: nextId++, name: f.name, size: f.size, pages, bytes })
      } catch {
        rejected.push(f.name)
      }
    }
    setFiles((prev) => [...prev, ...added])
    setLoading(false)
    if (rejected.length) {
      setError(`Could not read: ${rejected.join(', ')} — damaged, encrypted, or not a PDF.`)
    }
    job.clearSaved()
  }

  function move(index, dir) {
    setFiles((prev) => {
      const next = prev.slice()
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    job.clearSaved()
  }

  function remove(index) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    job.clearSaved()
  }

  function bind() {
    job.run(async () => {
      const outBytes = await mergePdfs(files.map((f) => f.bytes))
      const first = baseName(files[0].name)
      downloadBytes(outBytes, `${first} + ${files.length - 1} more (bound).pdf`)
    }, 'Binding failed — one of the PDFs may be damaged or encrypted.')
  }

  const totalPages = files.reduce((sum, f) => sum + f.pages, 0)

  return (
    <ToolShell
      no="002"
      title="The Binder"
      tagline="Gather several PDFs, set their order, and stitch them into one volume."
      onBack={onBack}
      error={error}
    >
      <Dropzone
        multiple
        compact={files.length > 0}
        loading={loading}
        loadingTitle="Collating the documents…"
        onFiles={addFiles}
        title={
          files.length === 0 ? (
            <>
              Drop your PDFs on the <em>binding bench</em>
            </>
          ) : (
            <>Add more documents</>
          )
        }
        hint="or click to browse — you can add several at once"
      />

      {files.length > 0 && (
        <>
          <p className="bench-hint reveal" style={{ '--d': '40ms' }}>
            {files.length < 2
              ? 'Add at least one more document to bind.'
              : 'Documents are stitched top to bottom — reorder them below.'}
          </p>

          <ol className="file-rows">
            {files.map((f, i) => (
              <li key={f.id} className="file-row reveal" style={{ '--d': `${i * 40}ms` }}>
                <span className="file-row-no">{String(i + 1).padStart(2, '0')}</span>
                <span className="file-row-name" title={f.name}>
                  {f.name}
                </span>
                <span className="file-row-facts">
                  {f.pages} {f.pages === 1 ? 'page' : 'pages'} · {formatBytes(f.size)}
                </span>
                <span className="file-row-actions">
                  <button className="row-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                    ↑
                  </button>
                  <button
                    className="row-btn"
                    onClick={() => move(i, 1)}
                    disabled={i === files.length - 1}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button className="row-btn row-btn-danger" onClick={() => remove(i)} aria-label="Remove">
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ol>

          <ActionBar
            saved={job.saved}
            savedText="✓ Bound volume saved to your downloads"
            info={
              <CountInfo
                value={String(files.length).padStart(2, '0')}
                caption={`documents · ${totalPages} pages total`}
              />
            }
          >
            <button
              className="btn btn-ghost"
              onClick={() => {
                setFiles([])
                setError(null)
              }}
            >
              Clear all
            </button>
            <button className="btn btn-cut" onClick={bind} disabled={files.length < 2 || job.busy}>
              {job.busy ? 'Binding…' : 'Bind & download'}
            </button>
          </ActionBar>
        </>
      )}
    </ToolShell>
  )
}
