import { useState } from 'react'
import { readPdfMeta, writePdfMeta, downloadBytes, formatBytes } from '../lib/pdfEngine.js'
import { ToolShell, Dropzone, ActionBar, CountInfo, usePdfDoc, useJob } from './ToolShell.jsx'

const FIELDS = [
  { key: 'title', label: 'Title' },
  { key: 'author', label: 'Author' },
  { key: 'subject', label: 'Subject' },
  { key: 'keywords', label: 'Keywords (comma-separated)' },
]

export default function Ledger({ onBack }) {
  const [record, setRecord] = useState(null)
  const [original, setOriginal] = useState(null)
  const pdf = usePdfDoc({
    thumbs: false,
    onLoaded: async (meta, { bytes }) => {
      const m = await readPdfMeta(bytes)
      setRecord(m)
      setOriginal(m)
    },
  })
  const job = useJob(pdf.setError)

  function save() {
    job.run(async () => {
      const outBytes = await writePdfMeta(pdf.bytesRef.current, record)
      downloadBytes(outBytes, `${pdf.meta.base} (retitled).pdf`)
    }, 'Saving failed — this PDF may be damaged.')
  }

  const dirty =
    record && original && FIELDS.some(({ key }) => record[key] !== original[key])

  return (
    <ToolShell
      no="012"
      title="The Ledger"
      tagline="Every PDF carries a hidden record — title, author, subject. Correct the entry and save a fresh copy."
      onBack={onBack}
      error={pdf.error}
    >
      {pdf.phase !== 'ready' && (
        <Dropzone
          onFiles={([f]) => pdf.handleFile(f)}
          loading={pdf.phase === 'loading'}
          loadingTitle="Opening the ledger…"
          title={
            <>
              Enter a PDF into the <em>ledger</em>
            </>
          }
        />
      )}

      {pdf.phase === 'ready' && pdf.meta && record && (
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

          <div className="ledger-form reveal" style={{ '--d': '60ms' }}>
            {FIELDS.map(({ key, label }) => (
              <div className="field" key={key}>
                <label className="field-label" htmlFor={`meta-${key}`}>
                  {label}
                </label>
                <input
                  id={`meta-${key}`}
                  className="tinput"
                  type="text"
                  value={record[key]}
                  placeholder="—"
                  onChange={(e) => {
                    setRecord({ ...record, [key]: e.target.value })
                    job.clearSaved()
                  }}
                />
              </div>
            ))}
            {(record.creator || record.producer) && (
              <p className="field-note ledger-note">
                Produced by {[record.creator, record.producer].filter(Boolean).join(' · ')} — these
                entries stay as they are.
              </p>
            )}
          </div>

          <ActionBar
            saved={job.saved}
            savedText="✓ Corrected copy saved to your downloads"
            info={<CountInfo value={dirty ? 'Edited' : 'Unchanged'} caption="ledger entry" />}
          >
            <button className="btn btn-ghost" onClick={pdf.reset}>
              New file
            </button>
            <button className="btn btn-ghost" onClick={() => setRecord(original)} disabled={!dirty}>
              Revert
            </button>
            <button className="btn btn-cut" onClick={save} disabled={!dirty || job.busy}>
              {job.busy ? 'Recording…' : 'Save corrected copy'}
            </button>
          </ActionBar>
        </>
      )}
    </ToolShell>
  )
}
