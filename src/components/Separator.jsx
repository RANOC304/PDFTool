import { useState } from 'react'
import {
  extractPages,
  downloadBytes,
  parseRanges,
  formatRanges,
  formatBytes,
} from '../lib/pdfEngine.js'
import {
  ToolShell,
  Dropzone,
  ActionBar,
  CountInfo,
  ScissorsIcon,
  usePdfDoc,
  useJob,
} from './ToolShell.jsx'

const QUICK_PICKS = [
  { id: 'all', label: 'All' },
  { id: 'none', label: 'None' },
  { id: 'invert', label: 'Invert' },
  { id: 'odd', label: 'Odd' },
  { id: 'even', label: 'Even' },
]

export default function Separator({ onBack }) {
  const [selected, setSelected] = useState(new Set())
  const [rangeText, setRangeText] = useState('')
  const pdf = usePdfDoc({
    onLoaded: () => {
      setSelected(new Set())
      setRangeText('')
    },
  })
  const job = useJob(pdf.setError)

  function applySelection(next) {
    setSelected(next)
    setRangeText(formatRanges(next))
    job.clearSaved()
  }

  function togglePage(index) {
    const next = new Set(selected)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    applySelection(next)
  }

  function quickPick(id) {
    const next = new Set()
    for (let i = 0; i < pdf.meta.pageCount; i++) {
      const keep =
        id === 'all' ||
        (id === 'invert' && !selected.has(i)) ||
        (id === 'odd' && i % 2 === 0) ||
        (id === 'even' && i % 2 === 1)
      if (keep) next.add(i)
    }
    applySelection(next)
  }

  function cut() {
    job.run(async () => {
      const indices = [...selected].sort((a, b) => a - b)
      const outBytes = await extractPages(pdf.bytesRef.current, indices)
      const ranges = formatRanges(selected)
      const suffix = ranges.length <= 20 ? `pages ${ranges}` : `${indices.length} pages`
      downloadBytes(outBytes, `${pdf.meta.base} (${suffix}).pdf`)
    }, 'The cut failed — this PDF may be damaged or use unsupported encryption.')
  }

  const count = selected.size
  const total = pdf.meta?.pageCount ?? 0

  return (
    <ToolShell
      no="001"
      title="The Separator"
      tagline="Pick the pages worth keeping. Massicot cuts a fresh copy — your original is never touched."
      onBack={onBack}
      error={pdf.error}
    >
      {pdf.phase !== 'ready' && (
        <Dropzone onFiles={([f]) => pdf.handleFile(f)} loading={pdf.phase === 'loading'} />
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
              <label className="field-label" htmlFor="range-input">
                Pages to keep
              </label>
              <input
                id="range-input"
                className="tinput"
                type="text"
                inputMode="numeric"
                placeholder="e.g. 1-3, 7, 12-14"
                value={rangeText}
                onChange={(e) => {
                  setRangeText(e.target.value)
                  setSelected(parseRanges(e.target.value, total))
                  job.clearSaved()
                }}
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <div className="quick-picks" role="group" aria-label="Quick selection">
              {QUICK_PICKS.map((q) => (
                <button key={q.id} className="chip" onClick={() => quickPick(q.id)}>
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          <p className="bench-hint reveal" style={{ '--d': '60ms' }}>
            {count === 0
              ? 'Click the pages to keep, or type a range above.'
              : `Keeping ${count} of ${total} pages — ${total - count} will fall away.`}
          </p>

          <div className="sheet-grid">
            {pdf.thumbs.map((url, i) => {
              const isKept = selected.has(i)
              return (
                <button
                  key={i}
                  className={`page-thumb reveal ${isKept ? 'is-kept' : ''}`}
                  style={{ '--d': `${Math.min(i, 20) * 30}ms` }}
                  onClick={() => togglePage(i)}
                  aria-pressed={isKept}
                  aria-label={`Page ${i + 1}${isKept ? ', kept' : ''}`}
                >
                  <span className="page-paper">
                    {url ? <img src={url} alt="" draggable={false} /> : <span className="page-skeleton" />}
                    {isKept && <span className="keep-stamp">Keep</span>}
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
                value={String(count).padStart(2, '0')}
                total={String(total).padStart(2, '0')}
                caption="pages kept"
              />
            }
          >
            <button className="btn btn-ghost" onClick={pdf.reset}>
              New file
            </button>
            <button className="btn btn-cut" onClick={cut} disabled={count === 0 || job.busy}>
              <ScissorsIcon size={16} />
              {job.busy ? 'Cutting…' : 'Cut & download'}
            </button>
          </ActionBar>
        </>
      )}
    </ToolShell>
  )
}
