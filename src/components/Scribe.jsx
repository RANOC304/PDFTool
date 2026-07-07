import { useState } from 'react'
import { extractText, formatBytes, downloadBytes } from '../lib/pdfEngine.js'
import { ToolShell, Dropzone, ActionBar, CountInfo, usePdfDoc, useJob } from './ToolShell.jsx'

export default function Scribe({ onBack }) {
  const [pages, setPages] = useState(null) // array of page texts
  const [copied, setCopied] = useState(false)
  const pdf = usePdfDoc({
    thumbs: false,
    onLoaded: async (meta, { doc }) => {
      setPages(null)
      setCopied(false)
      const texts = await extractText(doc)
      setPages(texts)
    },
  })
  const job = useJob(pdf.setError)

  const fullText = pages
    ? pages
        .map((t, i) => `——— Page ${i + 1} ———\n\n${t || '(no text on this page)'}`)
        .join('\n\n')
    : ''
  const words = pages ? fullText.split(/\s+/).filter(Boolean).length : 0
  const hasAnyText = pages?.some((t) => t.length > 0)

  function download() {
    job.run(async () => {
      downloadBytes(new TextEncoder().encode(fullText), `${pdf.meta.base}.txt`, 'text/plain')
    })
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      pdf.setError('Could not reach the clipboard — download the .txt instead.')
    }
  }

  return (
    <ToolShell
      no="011"
      title="The Scribe"
      tagline="Copies every word off the pages into plain text. Scanned PDFs with no text layer come out empty."
      onBack={onBack}
      error={pdf.error}
    >
      {pdf.phase !== 'ready' && (
        <Dropzone
          onFiles={([f]) => pdf.handleFile(f)}
          loading={pdf.phase === 'loading'}
          loadingTitle="Taking dictation…"
          title={
            <>
              Read a PDF to the <em>scribe</em>
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
                {pdf.meta.pageCount} pages · {formatBytes(pdf.meta.size)}
              </span>
            </div>
          </div>

          {pages === null ? (
            <p className="bench-hint reveal">Transcribing…</p>
          ) : (
            <>
              {!hasAnyText && (
                <p className="bench-hint reveal">
                  No text found — this looks like a scan without a text layer.
                </p>
              )}
              <pre className="manuscript reveal" style={{ '--d': '60ms' }}>
                {fullText.slice(0, 20000)}
                {fullText.length > 20000 ? '\n\n… (preview truncated — the .txt holds everything)' : ''}
              </pre>
            </>
          )}

          <ActionBar
            saved={job.saved}
            savedText="✓ Text saved to your downloads"
            info={<CountInfo value={words.toLocaleString()} caption="words transcribed" />}
          >
            <button className="btn btn-ghost" onClick={pdf.reset}>
              New file
            </button>
            <button className="btn btn-ghost" onClick={copy} disabled={!pages || !hasAnyText}>
              {copied ? '✓ Copied' : 'Copy text'}
            </button>
            <button className="btn btn-cut" onClick={download} disabled={!pages || job.busy}>
              Download .txt
            </button>
          </ActionBar>
        </>
      )}
    </ToolShell>
  )
}
