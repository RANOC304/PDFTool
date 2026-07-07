import { useEffect, useRef, useState } from 'react'
import { imagesToPdf, downloadBytes, formatBytes, isImageFile } from '../lib/pdfEngine.js'
import { ToolShell, Dropzone, ActionBar, CountInfo, useJob } from './ToolShell.jsx'

let nextId = 1

export default function Album({ onBack }) {
  const [images, setImages] = useState([]) // { id, name, size, type, bytes, url }
  const [pageMode, setPageMode] = useState('fit')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const job = useJob(setError)
  const imagesRef = useRef(images)
  imagesRef.current = images

  // Revoke object URLs on unmount
  useEffect(() => () => imagesRef.current.forEach((img) => URL.revokeObjectURL(img.url)), [])

  async function addFiles(list) {
    setError(null)
    setLoading(true)
    const rejected = []
    const added = []
    for (const f of list) {
      if (!isImageFile(f)) {
        rejected.push(f.name)
        continue
      }
      added.push({
        id: nextId++,
        name: f.name,
        size: f.size,
        type: f.type,
        bytes: await f.arrayBuffer(),
        url: URL.createObjectURL(f),
      })
    }
    setImages((prev) => [...prev, ...added])
    setLoading(false)
    if (rejected.length) setError(`Not images: ${rejected.join(', ')}`)
    job.clearSaved()
  }

  function move(index, dir) {
    setImages((prev) => {
      const next = prev.slice()
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    job.clearSaved()
  }

  function remove(index) {
    setImages((prev) => {
      URL.revokeObjectURL(prev[index].url)
      return prev.filter((_, i) => i !== index)
    })
    job.clearSaved()
  }

  function assemble() {
    job.run(async () => {
      const outBytes = await imagesToPdf(images, { pageMode })
      const base = images[0].name.replace(/\.[^.]+$/, '')
      downloadBytes(outBytes, `${base} (album, ${images.length} ${images.length === 1 ? 'image' : 'images'}).pdf`)
    }, 'Assembly failed — one of the images could not be read.')
  }

  const totalSize = images.reduce((sum, f) => sum + f.size, 0)

  return (
    <ToolShell
      no="008"
      title="The Album"
      tagline="Photos, scans, screenshots — pasted one per page into a single PDF."
      onBack={onBack}
      error={error}
    >
      <Dropzone
        multiple
        compact={images.length > 0}
        loading={loading}
        accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp"
        loadingTitle="Mounting the prints…"
        onFiles={addFiles}
        title={
          images.length === 0 ? (
            <>
              Drop your images on the <em>album</em>
            </>
          ) : (
            <>Add more images</>
          )
        }
        hint="PNG, JPEG, WebP, GIF, BMP — several at once is fine"
      />

      {images.length > 0 && (
        <>
          <div className="workbench-bar reveal" style={{ '--d': '40ms' }}>
            <div className="field">
              <span className="field-label">Page size</span>
              <div className="quick-picks" role="radiogroup" aria-label="Page size">
                <button
                  className={`chip ${pageMode === 'fit' ? 'is-active' : ''}`}
                  role="radio"
                  aria-checked={pageMode === 'fit'}
                  onClick={() => setPageMode('fit')}
                >
                  Match each image
                </button>
                <button
                  className={`chip ${pageMode === 'a4' ? 'is-active' : ''}`}
                  role="radio"
                  aria-checked={pageMode === 'a4'}
                  onClick={() => setPageMode('a4')}
                >
                  A4, centred
                </button>
              </div>
            </div>
          </div>

          <div className="sheet-grid">
            {images.map((img, i) => (
              <div key={img.id} className="page-thumb is-static reveal" style={{ '--d': `${Math.min(i, 20) * 30}ms` }}>
                <span className="page-paper">
                  <img src={img.url} alt={img.name} draggable={false} />
                  <span className="thumb-tools">
                    <button className="row-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move earlier">
                      ←
                    </button>
                    <button className="row-btn row-btn-danger" onClick={() => remove(i)} aria-label="Remove image">
                      ✕
                    </button>
                    <button
                      className="row-btn"
                      onClick={() => move(i, 1)}
                      disabled={i === images.length - 1}
                      aria-label="Move later"
                    >
                      →
                    </button>
                  </span>
                </span>
                <span className="page-num" title={img.name}>
                  {String(i + 1).padStart(2, '0')} · {img.name.length > 14 ? img.name.slice(0, 12) + '…' : img.name}
                </span>
              </div>
            ))}
          </div>

          <ActionBar
            saved={job.saved}
            savedText="✓ Album saved to your downloads"
            info={
              <CountInfo
                value={String(images.length).padStart(2, '0')}
                caption={`images · ${formatBytes(totalSize)}`}
              />
            }
          >
            <button
              className="btn btn-ghost"
              onClick={() => {
                images.forEach((img) => URL.revokeObjectURL(img.url))
                setImages([])
                setError(null)
              }}
            >
              Clear all
            </button>
            <button className="btn btn-cut" onClick={assemble} disabled={images.length === 0 || job.busy}>
              {job.busy ? 'Assembling…' : 'Assemble & download'}
            </button>
          </ActionBar>
        </>
      )}
    </ToolShell>
  )
}
