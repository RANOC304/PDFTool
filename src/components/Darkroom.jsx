import { useState } from 'react'
import { pdfToImages, zipFiles, downloadBytes, formatBytes } from '../lib/pdfEngine.js'
import { ToolShell, Dropzone, ActionBar, CountInfo, usePdfDoc, useJob } from './ToolShell.jsx'

const RESOLUTIONS = [
  { id: 1, label: 'Screen · 1×' },
  { id: 2, label: 'Sharp · 2×' },
  { id: 3, label: 'Print · 3×' },
]

export default function Darkroom({ onBack }) {
  const [format, setFormat] = useState('png')
  const [scale, setScale] = useState(2)
  const [progress, setProgress] = useState(null)
  const pdf = usePdfDoc()
  const job = useJob(pdf.setError)

  function develop() {
    job.run(async () => {
      const files = await pdfToImages(pdf.docRef.current, {
        format,
        scale,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      setProgress(null)
      if (files.length === 1) {
        downloadBytes(files[0].bytes, `${pdf.meta.base} — ${files[0].name}`, format === 'jpeg' ? 'image/jpeg' : 'image/png')
      } else {
        downloadBytes(zipFiles(files), `${pdf.meta.base} (${format} images).zip`, 'application/zip')
      }
    }, 'Developing failed — this PDF may be damaged.')
  }

  const total = pdf.meta?.pageCount ?? 0

  return (
    <ToolShell
      no="009"
      title="The Darkroom"
      tagline="Every page developed into an image — one file per page, delivered in a ZIP."
      onBack={onBack}
      error={pdf.error}
    >
      {pdf.phase !== 'ready' && (
        <Dropzone
          onFiles={([f]) => pdf.handleFile(f)}
          loading={pdf.phase === 'loading'}
          title={
            <>
              Bring a PDF into the <em>darkroom</em>
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
              <span className="field-label">Film</span>
              <div className="quick-picks" role="radiogroup" aria-label="Image format">
                <button
                  className={`chip ${format === 'png' ? 'is-active' : ''}`}
                  role="radio"
                  aria-checked={format === 'png'}
                  onClick={() => setFormat('png')}
                >
                  PNG — crisp
                </button>
                <button
                  className={`chip ${format === 'jpeg' ? 'is-active' : ''}`}
                  role="radio"
                  aria-checked={format === 'jpeg'}
                  onClick={() => setFormat('jpeg')}
                >
                  JPEG — light
                </button>
              </div>
            </div>
            <div className="field">
              <span className="field-label">Enlargement</span>
              <div className="quick-picks" role="radiogroup" aria-label="Resolution">
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r.id}
                    className={`chip ${scale === r.id ? 'is-active' : ''}`}
                    role="radio"
                    aria-checked={scale === r.id}
                    onClick={() => setScale(r.id)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {job.busy && progress && (
            <div className="progress-block reveal">
              <p className="bench-hint">
                Developing page {progress.done} of {progress.total}…
              </p>
              <div className="progress">
                <i style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            </div>
          )}

          <div className="sheet-grid">
            {pdf.thumbs.map((url, i) => (
              <div key={i} className="page-thumb is-static reveal" style={{ '--d': `${Math.min(i, 20) * 30}ms` }}>
                <span className="page-paper">
                  {url ? <img src={url} alt="" draggable={false} /> : <span className="page-skeleton" />}
                </span>
                <span className="page-num">
                  page-{String(i + 1).padStart(2, '0')}.{format === 'jpeg' ? 'jpg' : 'png'}
                </span>
              </div>
            ))}
          </div>

          <ActionBar
            saved={job.saved}
            savedText={total === 1 ? '✓ Image saved to your downloads' : '✓ ZIP saved to your downloads'}
            info={<CountInfo value={String(total).padStart(2, '0')} caption="prints to develop" />}
          >
            <button className="btn btn-ghost" onClick={pdf.reset}>
              New file
            </button>
            <button className="btn btn-cut" onClick={develop} disabled={job.busy}>
              {job.busy ? 'Developing…' : total === 1 ? 'Develop & download' : 'Develop & download ZIP'}
            </button>
          </ActionBar>
        </>
      )}
    </ToolShell>
  )
}
