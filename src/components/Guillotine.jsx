import { useState } from 'react'
import { splitPdf, zipFiles, downloadBytes, formatBytes } from '../lib/pdfEngine.js'
import { ToolShell, Dropzone, ActionBar, CountInfo, ScissorsIcon, usePdfDoc, useJob } from './ToolShell.jsx'

export default function Guillotine({ onBack }) {
  const [chunk, setChunk] = useState(1)
  const pdf = usePdfDoc({ onLoaded: () => setChunk(1) })
  const job = useJob(pdf.setError)

  function chop() {
    job.run(async () => {
      const size = Math.max(1, chunk)
      const files = await splitPdf(pdf.bytesRef.current, size)
      if (files.length === 1) {
        downloadBytes(files[0].bytes, `${pdf.meta.base} — ${files[0].name}`)
      } else {
        const zip = zipFiles(files)
        downloadBytes(zip, `${pdf.meta.base} (split).zip`, 'application/zip')
      }
    }, 'Splitting failed — this PDF may be damaged.')
  }

  const total = pdf.meta?.pageCount ?? 0
  const size = Math.max(1, chunk)
  const parts = total ? Math.ceil(total / size) : 0

  // Group thumbnails into packets to preview the cuts
  const packets = []
  for (let start = 0; start < total; start += size) {
    packets.push({ start, end: Math.min(start + size, total) })
  }

  return (
    <ToolShell
      no="007"
      title="The Guillotine"
      tagline="One document goes in, many come out — bundled together in a ZIP."
      onBack={onBack}
      error={pdf.error}
    >
      {pdf.phase !== 'ready' && (
        <Dropzone
          onFiles={([f]) => pdf.handleFile(f)}
          loading={pdf.phase === 'loading'}
          title={
            <>
              Drop a PDF under the <em>blade</em>
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
              <span className="field-label">Cut every…</span>
              <div className="quick-picks" role="group" aria-label="Chunk size">
                {[1, 2, 5, 10].map((n) => (
                  <button
                    key={n}
                    className={`chip ${chunk === n ? 'is-active' : ''}`}
                    onClick={() => setChunk(n)}
                  >
                    {n === 1 ? 'Every page' : `${n} pages`}
                  </button>
                ))}
                <label className="chip chip-input" htmlFor="chunk-n">
                  Custom
                  <input
                    id="chunk-n"
                    type="number"
                    min={1}
                    max={Math.max(1, total)}
                    value={chunk}
                    onChange={(e) => setChunk(Math.max(1, Math.min(total, Number(e.target.value) || 1)))}
                  />
                </label>
              </div>
            </div>
          </div>

          <p className="bench-hint reveal" style={{ '--d': '60ms' }}>
            {parts === 1
              ? 'One part — the blade has nothing to cut. Increase the page count or download as-is.'
              : `The blade will fall ${parts - 1} ${parts - 1 === 1 ? 'time' : 'times'}, making ${parts} files.`}
          </p>

          <div className="packet-row">
            {packets.map((p, pi) => (
              <div key={pi} className="packet reveal" style={{ '--d': `${Math.min(pi, 12) * 40}ms` }}>
                <span className="packet-label">
                  Part {String(pi + 1).padStart(2, '0')} —{' '}
                  {p.end - p.start === 1 ? `p.${p.start + 1}` : `p.${p.start + 1}–${p.end}`}
                </span>
                <div className="packet-pages">
                  {Array.from({ length: p.end - p.start }, (_, k) => p.start + k).map((i) => (
                    <span key={i} className="packet-page">
                      {pdf.thumbs[i] ? <img src={pdf.thumbs[i]} alt={`Page ${i + 1}`} /> : <span className="page-skeleton" />}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <ActionBar
            saved={job.saved}
            savedText="✓ ZIP saved to your downloads"
            info={<CountInfo value={String(parts).padStart(2, '0')} caption="files after the cut" />}
          >
            <button className="btn btn-ghost" onClick={pdf.reset}>
              New file
            </button>
            <button className="btn btn-cut" onClick={chop} disabled={job.busy || total === 0}>
              <ScissorsIcon size={16} />
              {job.busy ? 'Chopping…' : parts > 1 ? 'Chop & download ZIP' : 'Download'}
            </button>
          </ActionBar>
        </>
      )}
    </ToolShell>
  )
}
