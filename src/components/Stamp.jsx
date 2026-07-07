import { useState } from 'react'
import { watermarkPdf, downloadBytes, formatBytes } from '../lib/pdfEngine.js'
import { ToolShell, Dropzone, ActionBar, CountInfo, usePdfDoc, useJob } from './ToolShell.jsx'

const PLACEMENTS = [
  { id: 'diagonal', label: 'Diagonal' },
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
]

const COLORS = [
  { id: 'grey', label: 'Grey', css: 'rgb(158, 153, 140)' },
  { id: 'vermillion', label: 'Vermillion', css: 'rgb(226, 68, 43)' },
  { id: 'ink', label: 'Ink', css: 'rgb(28, 23, 16)' },
]

const PREVIEW_WIDTH = 300

export default function Stamp({ onBack }) {
  const [text, setText] = useState('CONFIDENTIAL')
  const [placement, setPlacement] = useState('diagonal')
  const [colorName, setColorName] = useState('grey')
  const [size, setSize] = useState(48)
  const [opacity, setOpacity] = useState(0.18)
  const pdf = usePdfDoc()
  const job = useJob(pdf.setError)

  function stamp() {
    job.run(async () => {
      const outBytes = await watermarkPdf(pdf.bytesRef.current, {
        text: text.trim(),
        size,
        opacity,
        colorName,
        placement,
      })
      downloadBytes(outBytes, `${pdf.meta.base} (stamped).pdf`)
    }, 'Stamping failed — this PDF may be damaged.')
  }

  const total = pdf.meta?.pageCount ?? 0
  // Scale PDF points to preview pixels for a rough live preview
  const previewScale = pdf.meta ? PREVIEW_WIDTH / pdf.meta.firstPage.width : 1
  const previewColor = COLORS.find((c) => c.id === colorName).css

  return (
    <ToolShell
      no="005"
      title="The Stamp"
      tagline="Press a watermark into every page — a word, a warning, a claim."
      onBack={onBack}
      error={pdf.error}
    >
      {pdf.phase !== 'ready' && (
        <Dropzone
          onFiles={([f]) => pdf.handleFile(f)}
          loading={pdf.phase === 'loading'}
          title={
            <>
              Drop a PDF under the <em>stamp</em>
            </>
          }
        />
      )}

      {pdf.phase === 'ready' && pdf.meta && (
        <>
          <div className="stamp-bench reveal" style={{ '--d': '0ms' }}>
            <div className="stamp-controls workbench-bar">
              <div className="file-meta">
                <span className="file-name" title={pdf.meta.name}>
                  {pdf.meta.name}
                </span>
                <span className="file-facts">
                  {total} pages · {formatBytes(pdf.meta.size)}
                </span>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="stamp-text">
                  Mark
                </label>
                <input
                  id="stamp-text"
                  className="tinput"
                  type="text"
                  maxLength={60}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value)
                    job.clearSaved()
                  }}
                  spellCheck={false}
                />
              </div>

              <div className="field">
                <span className="field-label">Placement</span>
                <div className="quick-picks" role="radiogroup" aria-label="Placement">
                  {PLACEMENTS.map((p) => (
                    <button
                      key={p.id}
                      className={`chip ${placement === p.id ? 'is-active' : ''}`}
                      role="radio"
                      aria-checked={placement === p.id}
                      onClick={() => setPlacement(p.id)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <span className="field-label">Ink</span>
                <div className="quick-picks" role="radiogroup" aria-label="Colour">
                  {COLORS.map((c) => (
                    <button
                      key={c.id}
                      className={`chip ${colorName === c.id ? 'is-active' : ''}`}
                      role="radio"
                      aria-checked={colorName === c.id}
                      onClick={() => setColorName(c.id)}
                    >
                      <i className="chip-swatch" style={{ background: c.css }} />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="stamp-size">
                  Size — {size} pt
                </label>
                <input
                  id="stamp-size"
                  className="slider"
                  type="range"
                  min={16}
                  max={96}
                  step={2}
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="stamp-opacity">
                  Opacity — {Math.round(opacity * 100)}%
                </label>
                <input
                  id="stamp-opacity"
                  className="slider"
                  type="range"
                  min={5}
                  max={70}
                  step={1}
                  value={Math.round(opacity * 100)}
                  onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                />
              </div>
            </div>

            <div className="stamp-preview">
              <span className="field-label">Proof — page 1</span>
              <div className="wm-stage" style={{ width: PREVIEW_WIDTH }}>
                {pdf.thumbs[0] ? (
                  <img src={pdf.thumbs[0]} alt="First page preview" draggable={false} />
                ) : (
                  <span className="page-skeleton" />
                )}
                <span
                  className={`wm-text wm-${placement}`}
                  style={{
                    color: previewColor,
                    opacity,
                    fontSize: `${size * previewScale}px`,
                  }}
                >
                  {text.trim() || ' '}
                </span>
              </div>
            </div>
          </div>

          <ActionBar
            saved={job.saved}
            savedText="✓ Stamped copy saved to your downloads"
            info={<CountInfo value={String(total).padStart(2, '0')} caption="pages to stamp" />}
          >
            <button className="btn btn-ghost" onClick={pdf.reset}>
              New file
            </button>
            <button className="btn btn-cut" onClick={stamp} disabled={!text.trim() || job.busy}>
              {job.busy ? 'Stamping…' : 'Stamp & download'}
            </button>
          </ActionBar>
        </>
      )}
    </ToolShell>
  )
}
