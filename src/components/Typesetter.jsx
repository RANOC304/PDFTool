import { useState } from 'react'
import { addPageNumbers, downloadBytes, formatBytes } from '../lib/pdfEngine.js'
import { ToolShell, Dropzone, ActionBar, CountInfo, usePdfDoc, useJob } from './ToolShell.jsx'

const POSITIONS = [
  { id: 'bottom-center', label: 'Bottom centre' },
  { id: 'bottom-right', label: 'Bottom right' },
  { id: 'bottom-left', label: 'Bottom left' },
  { id: 'top-center', label: 'Top centre' },
  { id: 'top-right', label: 'Top right' },
  { id: 'top-left', label: 'Top left' },
]

const FORMATS = [
  { id: 'n', label: '1, 2, 3…' },
  { id: 'n-of-total', label: '1 / 12' },
  { id: 'page-n', label: 'Page 1' },
]

export default function Typesetter({ onBack }) {
  const [position, setPosition] = useState('bottom-center')
  const [format, setFormat] = useState('n')
  const [start, setStart] = useState(1)
  const pdf = usePdfDoc()
  const job = useJob(pdf.setError)

  function typeset() {
    job.run(async () => {
      const outBytes = await addPageNumbers(pdf.bytesRef.current, {
        position,
        format,
        start: Math.max(0, start),
      })
      downloadBytes(outBytes, `${pdf.meta.base} (numbered).pdf`)
    }, 'Typesetting failed — this PDF may be damaged.')
  }

  const total = pdf.meta?.pageCount ?? 0
  const sampleN = Math.max(0, start)
  const sample =
    format === 'n-of-total'
      ? `${sampleN} / ${sampleN + total - 1}`
      : format === 'page-n'
        ? `Page ${sampleN}`
        : `${sampleN}`

  return (
    <ToolShell
      no="010"
      title="The Typesetter"
      tagline="Neat page numbers, set in place on every page."
      onBack={onBack}
      error={pdf.error}
    >
      {pdf.phase !== 'ready' && (
        <Dropzone
          onFiles={([f]) => pdf.handleFile(f)}
          loading={pdf.phase === 'loading'}
          title={
            <>
              Hand a PDF to the <em>typesetter</em>
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
              <label className="field-label" htmlFor="pos-select">
                Corner
              </label>
              <select
                id="pos-select"
                className="tinput"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              >
                {POSITIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span className="field-label">Style</span>
              <div className="quick-picks" role="radiogroup" aria-label="Number style">
                {FORMATS.map((f) => (
                  <button
                    key={f.id}
                    className={`chip ${format === f.id ? 'is-active' : ''}`}
                    role="radio"
                    aria-checked={format === f.id}
                    onClick={() => setFormat(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field field-narrow">
              <label className="field-label" htmlFor="start-n">
                Start at
              </label>
              <input
                id="start-n"
                className="tinput"
                type="number"
                min={0}
                value={start}
                onChange={(e) => setStart(Number(e.target.value) || 0)}
              />
            </div>
          </div>

          <p className="bench-hint reveal" style={{ '--d': '60ms' }}>
            First page will read “{sample}” — {POSITIONS.find((p) => p.id === position).label.toLowerCase()}.
          </p>

          <div className="sheet-grid">
            {pdf.thumbs.map((url, i) => (
              <div key={i} className="page-thumb is-static reveal" style={{ '--d': `${Math.min(i, 20) * 30}ms` }}>
                <span className="page-paper">
                  {url ? <img src={url} alt="" draggable={false} /> : <span className="page-skeleton" />}
                  <span className={`folio-mark folio-${position}`}>
                    {format === 'n-of-total'
                      ? `${start + i} / ${start + total - 1}`
                      : format === 'page-n'
                        ? `Page ${start + i}`
                        : `${start + i}`}
                  </span>
                </span>
                <span className="page-num">P.{String(i + 1).padStart(2, '0')}</span>
              </div>
            ))}
          </div>

          <ActionBar
            saved={job.saved}
            savedText="✓ Numbered copy saved to your downloads"
            info={<CountInfo value={String(total).padStart(2, '0')} caption="pages to number" />}
          >
            <button className="btn btn-ghost" onClick={pdf.reset}>
              New file
            </button>
            <button className="btn btn-cut" onClick={typeset} disabled={job.busy}>
              {job.busy ? 'Setting type…' : 'Number & download'}
            </button>
          </ActionBar>
        </>
      )}
    </ToolShell>
  )
}
