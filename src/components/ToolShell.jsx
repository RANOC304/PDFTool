import { useRef, useState } from 'react'
import { openPdf, renderPageThumb, firstPageSize, isPdfFile } from '../lib/pdfEngine.js'

export function ScissorsIcon({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="2.7" />
      <circle cx="6" cy="18" r="2.7" />
      <path d="M8.3 7.8 20 19.2" />
      <path d="M8.3 16.2 20 4.8" />
    </svg>
  )
}

/**
 * Shared single-PDF loading state: bytes for pdf-lib, pdf.js doc,
 * progressive thumbnails, and error handling.
 */
export function usePdfDoc({ thumbs: wantThumbs = true, onLoaded } = {}) {
  const [phase, setPhase] = useState('empty') // empty | loading | ready
  const [error, setError] = useState(null)
  const [meta, setMeta] = useState(null) // { name, base, size, pageCount, firstPage }
  const [thumbs, setThumbs] = useState([])
  const bytesRef = useRef(null)
  const docRef = useRef(null)
  const loadIdRef = useRef(0)
  const onLoadedRef = useRef(onLoaded)
  onLoadedRef.current = onLoaded

  async function handleFile(file) {
    if (!file) return
    if (!isPdfFile(file)) {
      setError('That is not a PDF — this bench only works PDFs.')
      return
    }
    const loadId = ++loadIdRef.current
    setError(null)
    setPhase('loading')
    setThumbs([])
    try {
      const { bytes, doc, pageCount } = await openPdf(file)
      if (loadId !== loadIdRef.current) return
      bytesRef.current = bytes
      docRef.current = doc
      const firstPage = await firstPageSize(doc)
      if (loadId !== loadIdRef.current) return
      const nextMeta = {
        name: file.name,
        base: file.name.replace(/\.pdf$/i, ''),
        size: file.size,
        pageCount,
        firstPage,
      }
      setMeta(nextMeta)
      setThumbs(Array(pageCount).fill(null))
      setPhase('ready')
      onLoadedRef.current?.(nextMeta, { bytes, doc })
      if (wantThumbs) {
        for (let n = 1; n <= pageCount; n++) {
          const url = await renderPageThumb(doc, n)
          if (loadId !== loadIdRef.current) return
          setThumbs((prev) => {
            const next = prev.slice()
            next[n - 1] = url
            return next
          })
        }
      }
    } catch (err) {
      if (loadId !== loadIdRef.current) return
      console.error(err)
      setPhase('empty')
      setError(
        err?.name === 'PasswordException'
          ? 'This PDF is password-protected — unlock it before bringing it to the atelier.'
          : 'This file could not be read as a PDF. It may be damaged.',
      )
    }
  }

  function reset() {
    loadIdRef.current++
    docRef.current?.destroy?.()
    bytesRef.current = null
    docRef.current = null
    setPhase('empty')
    setMeta(null)
    setThumbs([])
    setError(null)
  }

  return { phase, error, setError, meta, thumbs, bytesRef, docRef, handleFile, reset }
}

export function ToolShell({ no, title, tagline, onBack, error, children }) {
  return (
    <section className="tool-page">
      <div className="tool-head reveal" style={{ '--d': '0ms' }}>
        <button className="backlink" onClick={onBack}>
          ← Back to the atelier
        </button>
        <div className="tool-head-title">
          <span className="tool-no">Nº {no}</span>
          <h2 className="tool-title">{title}</h2>
        </div>
        <p className="tool-tagline">{tagline}</p>
      </div>
      {error && (
        <div className="notice" role="alert">
          <span className="notice-mark">!</span> {error}
        </div>
      )}
      {children}
    </section>
  )
}

export function Dropzone({
  onFiles,
  accept = 'application/pdf,.pdf',
  multiple = false,
  loading = false,
  compact = false,
  title,
  loadingTitle = 'Laying out the pages…',
  hint = 'or click to browse — processed locally, never uploaded',
}) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  return (
    <div
      className={`dropzone ${compact ? 'dropzone-compact' : ''} reveal ${dragging ? 'is-dragging' : ''} ${loading ? 'is-loading' : ''}`}
      style={{ '--d': '90ms' }}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const files = [...(e.dataTransfer.files || [])]
        if (files.length) onFiles(multiple ? files : files.slice(0, 1))
      }}
      onClick={() => !loading && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
    >
      <span className="dropzone-scissors" aria-hidden="true">
        <ScissorsIcon size={22} />
      </span>
      {loading ? (
        <>
          <p className="dropzone-title">{loadingTitle}</p>
          <p className="dropzone-hint">Reading your document</p>
        </>
      ) : (
        <>
          <p className="dropzone-title">
            {title ?? (
              <>
                Drop a PDF on the <em>cutting table</em>
              </>
            )}
          </p>
          <p className="dropzone-hint">{hint}</p>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files = [...(e.target.files || [])]
          if (files.length) onFiles(multiple ? files : files.slice(0, 1))
          e.target.value = ''
        }}
      />
    </div>
  )
}

export function ActionBar({ info, saved, savedText = '✓ Copy saved to your downloads', children }) {
  return (
    <div className="cutbar">
      <div className="cutbar-info">
        {info}
        {saved && <span className="cutbar-saved">{savedText}</span>}
      </div>
      <div className="cutbar-actions">{children}</div>
    </div>
  )
}

/** Big count readout for ActionBar info slots. */
export function CountInfo({ value, total, caption }) {
  return (
    <>
      <span className="cutbar-count">
        {value}
        {total != null && (
          <>
            <span className="cutbar-slash">/</span>
            {total}
          </>
        )}
      </span>
      <span className="cutbar-caption">{caption}</span>
    </>
  )
}

/** Small helper: run an async job, tracking busy + "saved" toast state. */
export function useJob(setError) {
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const timerRef = useRef(null)

  async function run(job, failMessage) {
    if (busy) return
    setBusy(true)
    setSaved(false)
    setError?.(null)
    try {
      await job()
      setSaved(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setSaved(false), 4000)
    } catch (err) {
      console.error(err)
      setError?.(failMessage ?? 'Something went wrong — this PDF may be damaged or encrypted.')
    } finally {
      setBusy(false)
    }
  }

  return { busy, saved, run, clearSaved: () => setSaved(false) }
}
