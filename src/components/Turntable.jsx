import { useState } from 'react'
import { rotatePages, downloadBytes, formatBytes } from '../lib/pdfEngine.js'
import { ToolShell, Dropzone, ActionBar, CountInfo, usePdfDoc, useJob } from './ToolShell.jsx'

export default function Turntable({ onBack }) {
  const [deltas, setDeltas] = useState([])
  const pdf = usePdfDoc({ onLoaded: (meta) => setDeltas(Array(meta.pageCount).fill(0)) })
  const job = useJob(pdf.setError)

  function spin(index, by) {
    setDeltas((prev) => {
      const next = prev.slice()
      next[index] = (next[index] + by) % 360
      return next
    })
    job.clearSaved()
  }

  function spinAll(by) {
    setDeltas((prev) => prev.map((d) => (d + by) % 360))
    job.clearSaved()
  }

  function save() {
    job.run(async () => {
      const outBytes = await rotatePages(pdf.bytesRef.current, deltas)
      downloadBytes(outBytes, `${pdf.meta.base} (rotated).pdf`)
    }, 'Rotation failed — this PDF may be damaged.')
  }

  const touched = deltas.filter((d) => ((d % 360) + 360) % 360 !== 0).length
  const total = pdf.meta?.pageCount ?? 0

  return (
    <ToolShell
      no="004"
      title="The Turntable"
      tagline="Click a page to give it a quarter turn. Spin the whole record with the controls."
      onBack={onBack}
      error={pdf.error}
    >
      {pdf.phase !== 'ready' && (
        <Dropzone
          onFiles={([f]) => pdf.handleFile(f)}
          loading={pdf.phase === 'loading'}
          title={
            <>
              Drop a PDF on the <em>turntable</em>
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
            <div className="quick-picks" role="group" aria-label="Rotate all pages">
              <button className="chip" onClick={() => spinAll(90)}>
                All ⟳ 90°
              </button>
              <button className="chip" onClick={() => spinAll(-90)}>
                All ⟲ 90°
              </button>
              <button className="chip" onClick={() => spinAll(180)}>
                All 180°
              </button>
              <button className="chip" onClick={() => setDeltas(Array(total).fill(0))}>
                Reset
              </button>
            </div>
          </div>

          <p className="bench-hint reveal" style={{ '--d': '60ms' }}>
            {touched === 0
              ? 'Click any page to rotate it a quarter turn clockwise.'
              : `${touched} of ${total} pages will be turned.`}
          </p>

          <div className="sheet-grid">
            {pdf.thumbs.map((url, i) => {
              const d = ((deltas[i] % 360) + 360) % 360
              return (
                <button
                  key={i}
                  className={`page-thumb reveal ${d !== 0 ? 'is-kept' : ''}`}
                  style={{ '--d': `${Math.min(i, 20) * 30}ms` }}
                  onClick={() => spin(i, 90)}
                  aria-label={`Page ${i + 1}, rotated ${d} degrees. Click to rotate further.`}
                >
                  <span className="page-paper">
                    {url ? (
                      <img
                        src={url}
                        alt=""
                        draggable={false}
                        style={{
                          transform: `rotate(${deltas[i]}deg) scale(${d % 180 !== 0 ? 0.72 : 1})`,
                          transition: 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
                        }}
                      />
                    ) : (
                      <span className="page-skeleton" />
                    )}
                    {d !== 0 && <span className="keep-stamp">{d}°</span>}
                  </span>
                  <span className="page-num">P.{String(i + 1).padStart(2, '0')}</span>
                </button>
              )
            })}
          </div>

          <ActionBar
            saved={job.saved}
            info={
              <CountInfo
                value={String(touched).padStart(2, '0')}
                total={String(total).padStart(2, '0')}
                caption="pages turned"
              />
            }
          >
            <button className="btn btn-ghost" onClick={pdf.reset}>
              New file
            </button>
            <button className="btn btn-cut" onClick={save} disabled={touched === 0 || job.busy}>
              {job.busy ? 'Turning…' : 'Save turned copy'}
            </button>
          </ActionBar>
        </>
      )}
    </ToolShell>
  )
}
