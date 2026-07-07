import { useRef, useState } from 'react'
import { reorderPages, downloadBytes, formatBytes } from '../lib/pdfEngine.js'
import { ToolShell, Dropzone, ActionBar, CountInfo, usePdfDoc, useJob } from './ToolShell.jsx'

let nextKey = 1

export default function Composer({ onBack }) {
  const [order, setOrder] = useState([]) // { src, key } — duplicates allowed
  const [dragIndex, setDragIndex] = useState(null)
  const dragFrom = useRef(null)
  const pdf = usePdfDoc({
    onLoaded: (meta) =>
      setOrder(Array.from({ length: meta.pageCount }, (_, i) => ({ src: i, key: nextKey++ }))),
  })
  const job = useJob(pdf.setError)

  function update(fn) {
    setOrder(fn)
    job.clearSaved()
  }

  function move(from, to) {
    if (from === to || from == null || to == null) return
    update((prev) => {
      const next = prev.slice()
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  function nudge(index, dir) {
    const target = index + dir
    if (target < 0 || target >= order.length) return
    move(index, target)
  }

  function duplicate(index) {
    update((prev) => {
      const next = prev.slice()
      next.splice(index + 1, 0, { src: prev[index].src, key: nextKey++ })
      return next
    })
  }

  function remove(index) {
    update((prev) => prev.filter((_, i) => i !== index))
  }

  function save() {
    job.run(async () => {
      const outBytes = await reorderPages(
        pdf.bytesRef.current,
        order.map((o) => o.src),
      )
      downloadBytes(outBytes, `${pdf.meta.base} (recomposed).pdf`)
    }, 'Recomposing failed — this PDF may be damaged.')
  }

  const total = pdf.meta?.pageCount ?? 0
  const originalOrder =
    order.length === total && order.every((o, i) => o.src === i)

  return (
    <ToolShell
      no="006"
      title="The Composer"
      tagline="Drag pages into a new order. Duplicate what you need twice, discard what you don't."
      onBack={onBack}
      error={pdf.error}
    >
      {pdf.phase !== 'ready' && (
        <Dropzone
          onFiles={([f]) => pdf.handleFile(f)}
          loading={pdf.phase === 'loading'}
          title={
            <>
              Drop a PDF on the <em>composing stone</em>
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
            <div className="quick-picks" role="group" aria-label="Arrangement">
              <button className="chip" onClick={() => update((prev) => prev.slice().reverse())}>
                Reverse
              </button>
              <button
                className="chip"
                onClick={() =>
                  update(() => Array.from({ length: total }, (_, i) => ({ src: i, key: nextKey++ })))
                }
              >
                Reset
              </button>
            </div>
          </div>

          <p className="bench-hint reveal" style={{ '--d': '60ms' }}>
            {originalOrder
              ? 'Drag a page to move it — or use the small tools on each card.'
              : `New arrangement: ${order.length} pages (was ${total}).`}
          </p>

          <div className="sheet-grid">
            {order.map((item, i) => (
              <div
                key={item.key}
                className={`page-thumb is-static composer-card reveal ${dragIndex === i ? 'is-dragging-card' : ''}`}
                style={{ '--d': `${Math.min(i, 20) * 30}ms` }}
                draggable
                onDragStart={(e) => {
                  dragFrom.current = i
                  setDragIndex(i)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragEnd={() => {
                  dragFrom.current = null
                  setDragIndex(null)
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  move(dragFrom.current, i)
                  dragFrom.current = null
                  setDragIndex(null)
                }}
              >
                <span className="page-paper">
                  {pdf.thumbs[item.src] ? (
                    <img src={pdf.thumbs[item.src]} alt={`Page ${item.src + 1}`} draggable={false} />
                  ) : (
                    <span className="page-skeleton" />
                  )}
                  <span className="thumb-tools">
                    <button className="row-btn" onClick={() => nudge(i, -1)} disabled={i === 0} aria-label="Move earlier">
                      ←
                    </button>
                    <button className="row-btn" onClick={() => duplicate(i)} aria-label="Duplicate page">
                      ⧉
                    </button>
                    <button className="row-btn row-btn-danger" onClick={() => remove(i)} aria-label="Remove page">
                      ✕
                    </button>
                    <button
                      className="row-btn"
                      onClick={() => nudge(i, 1)}
                      disabled={i === order.length - 1}
                      aria-label="Move later"
                    >
                      →
                    </button>
                  </span>
                </span>
                <span className="page-num">
                  {String(i + 1).padStart(2, '0')} · was P.{String(item.src + 1).padStart(2, '0')}
                </span>
              </div>
            ))}
          </div>

          <ActionBar
            saved={job.saved}
            info={
              <CountInfo
                value={String(order.length).padStart(2, '0')}
                caption={`pages in the new arrangement`}
              />
            }
          >
            <button className="btn btn-ghost" onClick={pdf.reset}>
              New file
            </button>
            <button
              className="btn btn-cut"
              onClick={save}
              disabled={order.length === 0 || originalOrder || job.busy}
            >
              {job.busy ? 'Composing…' : 'Save arrangement'}
            </button>
          </ActionBar>
        </>
      )}
    </ToolShell>
  )
}
