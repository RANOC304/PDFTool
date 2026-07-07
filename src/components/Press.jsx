import { useState } from 'react'
import { rasterizePdf, downloadBytes, formatBytes } from '../lib/pdfEngine.js'
import { ToolShell, Dropzone, ActionBar, CountInfo, usePdfDoc, useJob } from './ToolShell.jsx'

const PRESETS = [
  { id: 'gentle', label: 'Gentle', detail: 'Best quality · modest savings', dpi: 144, quality: 0.85 },
  { id: 'firm', label: 'Firm', detail: 'Good quality · strong savings', dpi: 110, quality: 0.7 },
  { id: 'flat', label: 'Flat', detail: 'Rough quality · maximum savings', dpi: 75, quality: 0.5 },
]

export default function Press({ onBack }) {
  const [preset, setPreset] = useState('firm')
  const [progress, setProgress] = useState(null) // { done, total }
  const [result, setResult] = useState(null) // { before, after }
  const pdf = usePdfDoc({ onLoaded: () => setResult(null) })
  const job = useJob(pdf.setError)

  function press() {
    const { dpi, quality } = PRESETS.find((p) => p.id === preset)
    job.run(async () => {
      setResult(null)
      const outBytes = await rasterizePdf(pdf.docRef.current, {
        dpi,
        quality,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      setProgress(null)
      setResult({ before: pdf.meta.size, after: outBytes.length })
      downloadBytes(outBytes, `${pdf.meta.base} (pressed).pdf`)
    }, 'Pressing failed — this PDF may be damaged.')
  }

  const total = pdf.meta?.pageCount ?? 0

  return (
    <ToolShell
      no="003"
      title="The Press"
      tagline="Re-photographs every page at lower fidelity to shrink the file. Note: text in the pressed copy is no longer selectable."
      onBack={onBack}
      error={pdf.error}
    >
      {pdf.phase !== 'ready' && (
        <Dropzone
          onFiles={([f]) => pdf.handleFile(f)}
          loading={pdf.phase === 'loading'}
          title={
            <>
              Drop a heavy PDF under the <em>press</em>
            </>
          }
        />
      )}

      {pdf.phase === 'ready' && pdf.meta && (
        <>
          <div className="workbench-bar reveal" style={{ '--d': '0ms' }}>
            <div className="file-meta">
              <span className="file-name" title={pdf.meta.name}>
                {pdf.meta.name}
              </span>
              <span className="file-facts">
                {total} pages · {formatBytes(pdf.meta.size)}
              </span>
            </div>
            <div className="field">
              <span className="field-label">Pressure</span>
              <div className="quick-picks" role="radiogroup" aria-label="Compression strength">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    className={`chip ${preset === p.id ? 'is-active' : ''}`}
                    role="radio"
                    aria-checked={preset === p.id}
                    title={p.detail}
                    onClick={() => setPreset(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <span className="field-note">{PRESETS.find((p) => p.id === preset).detail}</span>
            </div>
          </div>

          {job.busy && progress && (
            <div className="progress-block reveal">
              <p className="bench-hint">
                Pressing page {progress.done} of {progress.total}…
              </p>
              <div className="progress">
                <i style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            </div>
          )}

          {result && (
            <p className="bench-hint result-line reveal">
              {formatBytes(result.before)} → <strong>{formatBytes(result.after)}</strong>{' '}
              {result.after < result.before
                ? `(${Math.round((1 - result.after / result.before) * 100)}% lighter)`
                : '— this PDF was already lean; the pressed copy came out heavier.'}
            </p>
          )}

          <div className="sheet-grid">
            {pdf.thumbs.map((url, i) => (
              <div key={i} className="page-thumb is-static reveal" style={{ '--d': `${Math.min(i, 20) * 30}ms` }}>
                <span className="page-paper">
                  {url ? <img src={url} alt="" draggable={false} /> : <span className="page-skeleton" />}
                </span>
                <span className="page-num">P.{String(i + 1).padStart(2, '0')}</span>
              </div>
            ))}
          </div>

          <ActionBar
            saved={job.saved}
            savedText="✓ Pressed copy saved to your downloads"
            info={<CountInfo value={formatBytes(pdf.meta.size)} caption="on the press" />}
          >
            <button className="btn btn-ghost" onClick={pdf.reset}>
              New file
            </button>
            <button className="btn btn-cut" onClick={press} disabled={job.busy}>
              {job.busy ? 'Pressing…' : 'Press & download'}
            </button>
          </ActionBar>
        </>
      )}
    </ToolShell>
  )
}
