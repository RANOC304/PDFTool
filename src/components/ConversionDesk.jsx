import { useEffect, useMemo, useState } from 'react'
import {
  CONVERSION_BY_ID,
  SOURCE_OPTIONS,
  conversionsForSource,
  reverseForConversion,
} from '../conversions.js'
import { convertFile } from '../lib/conversionEngine.js'
import { downloadBytes, formatBytes } from '../lib/pdfEngine.js'
import { ActionBar, Dropzone, ToolShell, useJob } from './ToolShell.jsx'

const FALLBACK_ROUTE = 'psd-docx'

export default function ConversionDesk({ initialConversion, onBack }) {
  const [conversionId, setConversionId] = useState(
    CONVERSION_BY_ID[initialConversion] ? initialConversion : FALLBACK_ROUTE,
  )
  const [file, setFile] = useState(null)
  const [error, setError] = useState(null)
  const conversion = CONVERSION_BY_ID[conversionId]
  const reverseConversion = reverseForConversion(conversion)
  const job = useJob(setError)

  useEffect(() => {
    if (CONVERSION_BY_ID[initialConversion]) setConversionId(initialConversion)
  }, [initialConversion])

  const targetOptions = useMemo(() => conversionsForSource(conversion.source), [conversion.source])

  function changeRoute(nextId) {
    setConversionId(nextId)
    setFile(null)
    setError(null)
    job.clearSaved()
  }

  function chooseFile([nextFile]) {
    if (!nextFile) return
    const extensions = conversion.accept
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.startsWith('.'))
    if (!extensions.some((extension) => nextFile.name.toLowerCase().endsWith(extension))) {
      setError(`That file does not match the ${conversion.sourceLabel} side of this route.`)
      return
    }
    setFile(nextFile)
    setError(null)
    job.clearSaved()
  }

  function runConversion() {
    job.run(async () => {
      const result = await convertFile(file, conversion)
      downloadBytes(result.bytes, result.filename, result.mime)
    }, 'The conversion could not be completed. The file may be damaged or use an unsupported variant of the format.')
  }

  const progressCopy = conversion.source === 'psd'
    ? 'Reading the composition and preparing its layers…'
    : conversion.source === 'pdf'
      ? 'Turning the pages into their new form…'
      : 'Preparing the converted copy…'

  return (
    <ToolShell
      no="C01"
      title="The Conversion Desk"
      tagline="One file in, another useful form out — handled on your machine from first byte to last."
      onBack={onBack}
      error={error}
    >
      <div className="conversion-route reveal" style={{ '--d': '70ms' }}>
        <div className="conversion-route-head">
          <span className="conversion-route-kicker">Set the route</span>
          <span className="conversion-local-mark">
            {reverseConversion ? 'Two-way · local' : 'One-way · local'}
          </span>
        </div>
        <div className="conversion-route-fields">
          <label className="route-field">
            <span className="field-label">From</span>
            <select
              className="tinput route-select"
              value={conversion.source}
              onChange={(event) => changeRoute(conversionsForSource(event.target.value)[0].id)}
            >
              {SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          {reverseConversion ? (
            <button
              type="button"
              className="route-swap"
              onClick={() => changeRoute(reverseConversion.id)}
              aria-label={`Swap direction: ${reverseConversion.sourceLabel} to ${reverseConversion.targetLabel}`}
            >
              <span aria-hidden="true">⇄</span>
              <small>Swap</small>
            </button>
          ) : (
            <span className="route-arrow" aria-hidden="true">→</span>
          )}
          <label className="route-field">
            <span className="field-label">Into</span>
            <select
              className="tinput route-select"
              value={conversion.id}
              onChange={(event) => changeRoute(event.target.value)}
            >
              {targetOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.targetLabel}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="conversion-route-note">{conversion.note}</p>
      </div>

      {!file ? (
        <Dropzone
          key={conversion.id}
          accept={conversion.accept}
          onFiles={chooseFile}
          title={
            <>
              Drop your <em>{conversion.sourceLabel}</em> on the desk
            </>
          }
          hint={`${conversion.sourceLabel} → ${conversion.targetLabel} · private, local and ready to download`}
        />
      ) : (
        <>
          <div className="conversion-file reveal" style={{ '--d': '40ms' }}>
            <div className="conversion-file-mark" aria-hidden="true">
              <span>{conversion.sourceLabel}</span>
              <i>→</i>
              <span>{conversion.targetLabel}</span>
            </div>
            <div className="file-meta">
              <span className="file-name" title={file.name}>{file.name}</span>
              <span className="file-facts">{formatBytes(file.size)} · ready for the conversion desk</span>
            </div>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setFile(null)
                setError(null)
                job.clearSaved()
              }}
              disabled={job.busy}
            >
              Choose another
            </button>
          </div>

          <div className="conversion-disclosure reveal" style={{ '--d': '80ms' }}>
            <span className="notice-mark">i</span>
            <p>
              <strong>{conversion.sourceLabel} to {conversion.targetLabel}</strong>
              {conversion.id === 'psd-docx' && ' produces a Word document with a flattened preview and a layer inventory; the Photoshop layers do not become editable Word objects.'}
              {conversion.id === 'psd-xlsx' && ' produces an Excel workbook of document facts and layers, including visibility, opacity, blend mode, bounds and text-layer copy.'}
              {!['psd-docx', 'psd-xlsx'].includes(conversion.id) && ` — ${conversion.note}`}
            </p>
          </div>

          {job.busy && (
            <div className="progress-block reveal" role="status">
              <p className="bench-hint">{progressCopy}</p>
              <div className="progress is-indeterminate"><i /></div>
            </div>
          )}

          <ActionBar
            saved={job.saved}
            savedText="✓ Converted copy saved to your downloads"
            info={
              <>
                <span className="cutbar-count">{conversion.sourceLabel}</span>
                <span className="cutbar-caption">to {conversion.targetLabel}</span>
              </>
            }
          >
            <button className="btn btn-cut" onClick={runConversion} disabled={job.busy}>
              {job.busy ? 'Converting…' : `Convert to ${conversion.targetLabel}`}
            </button>
          </ActionBar>
        </>
      )}
    </ToolShell>
  )
}
