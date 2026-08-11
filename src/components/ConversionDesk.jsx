import { useEffect, useMemo, useRef, useState } from 'react'
import { Zip, ZipPassThrough } from 'fflate'
import {
  CONVERSION_BY_ID,
  FIDELITY,
  FORMATS,
  KNOWN_EXTENSION_COUNT,
  PRESERVATION_DIMENSIONS,
  PRESERVATION_LEVELS,
  SOURCE_GROUPS,
  conversionsForSource,
  sourceForFilename,
} from '../conversions.js'
import { convertFile } from '../lib/conversionEngine.js'
import { downloadBlob, downloadBytes, formatBytes } from '../lib/pdfEngine.js'
import { ScissorsIcon, ToolShell } from './ToolShell.jsx'

const FALLBACK_ROUTE = 'pdf-png'
const MAX_FILES = 50
let fileSequence = 0

function matchesSource(file, conversion) {
  if (conversion.source === 'any' && !conversion.accept) return true
  const lower = file.name.toLowerCase()
  const extensions = conversion.accept
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.startsWith('.'))
  return extensions.some((extension) => lower.endsWith(extension))
}

function extensionFromFilename(filename) {
  const match = filename.toLowerCase().match(/\.([^./\\]+)$/)
  return match ? match[1].replace(/[^a-z0-9._+-]/g, '').slice(0, 40) : ''
}

function conversionWithCustomSource(conversion, customExtension) {
  if (conversion.source !== 'any' || !customExtension) return conversion
  return {
    ...conversion,
    sourceLabel: customExtension.toUpperCase(),
    accept: `.${customExtension}`,
  }
}

function uniqueFilename(filename, used) {
  if (!used.has(filename)) {
    used.add(filename)
    return filename
  }
  const dot = filename.lastIndexOf('.')
  const stem = dot > 0 ? filename.slice(0, dot) : filename
  const extension = dot > 0 ? filename.slice(dot) : ''
  let copy = 2
  let candidate = `${stem} (${copy})${extension}`
  while (used.has(candidate)) {
    copy += 1
    candidate = `${stem} (${copy})${extension}`
  }
  used.add(candidate)
  return candidate
}

function FormatPicker({ value, customExtension, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const selected = value === 'any' && customExtension
    ? {
        label: customExtension.toUpperCase(),
        name: 'Custom or future extension',
        extensions: [`.${customExtension}`],
      }
    : FORMATS[value]

  useEffect(() => {
    if (!open) return undefined
    inputRef.current?.focus()
    const close = (event) => {
      if (event.key === 'Escape' || !rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const needle = query.trim().toLowerCase()
  const customCandidate = needle
    .replace(/^\*?\./, '')
    .replace(/[^a-z0-9._+-]/g, '')
    .slice(0, 40)
  const exactExtension = customCandidate ? `.${customCandidate}` : ''
  const groups = SOURCE_GROUPS.map((group) => ({
    ...group,
    options: group.options
      .filter((option) =>
        !needle || [option.label, option.name, option.category, ...option.extensions]
          .join(' ')
          .toLowerCase()
          .includes(needle),
      )
      .sort((a, b) =>
        Number(b.extensions.includes(exactExtension)) - Number(a.extensions.includes(exactExtension)),
      ),
  }))
    .filter((group) => group.options.length)
    .sort((a, b) =>
      Number(b.options.some((option) => option.extensions.includes(exactExtension)))
        - Number(a.options.some((option) => option.extensions.includes(exactExtension))),
    )

  return (
    <div className="format-picker" ref={rootRef}>
      <button
        type="button"
        className="format-picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setQuery('')
          setOpen((current) => !current)
        }}
        disabled={disabled}
      >
        <span className="format-monogram">{selected.label}</span>
        <span className="format-trigger-copy">
          <strong>{selected.name}</strong>
          <small>{selected.extensions.join(' · ')}</small>
        </span>
        <span className="format-chevron" aria-hidden="true">⌄</span>
      </button>

      {open && (
        <div className="format-menu" role="dialog" aria-label="Choose a source file type">
          <label className="format-search">
            <span aria-hidden="true">⌕</span>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search PDF, image, document…"
              aria-label="Search file types"
            />
          </label>
          <div className="format-menu-scroll">
            {groups.map((group) => (
              <section className="format-group" key={group.id}>
                <div className="format-group-head">
                  <strong>{group.label}</strong>
                  <span>{group.options.length} {group.options.length === 1 ? 'type' : 'types'} · {group.description}</span>
                </div>
                <div className="format-options">
                  {group.options.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      className={option.value === value ? 'is-selected' : ''}
                      onClick={() => {
                        onChange(option.value, '')
                        setOpen(false)
                      }}
                    >
                      <span>{option.label}</span>
                      <small>{option.name}</small>
                    </button>
                  ))}
                </div>
              </section>
            ))}
            {customCandidate && !groups.some((group) =>
              group.options.some((option) => option.extensions.includes(`.${customCandidate}`))
            ) && (
              <button
                type="button"
                className="custom-format-option"
                onClick={() => {
                  onChange('any', customCandidate)
                  setOpen(false)
                }}
              >
                <span>Use .{customCandidate}</span>
                <small>Custom or future extension · byte-perfect outputs</small>
              </button>
            )}
            {!groups.length && !customCandidate && (
              <p className="format-empty">Type any extension—even one that was created today.</p>
            )}
          </div>
          <div className="format-catalogue-foot">
            {KNOWN_EXTENSION_COUNT.toLocaleString()} registered extensions · custom extensions always accepted
          </div>
        </div>
      )}
    </div>
  )
}

function SourceDrop({ conversion, count, onFiles, disabled }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  function receive(files) {
    const list = [...(files || [])]
    if (list.length) onFiles(list)
  }

  return (
    <div
      className={`conversion-drop ${dragging ? 'is-dragging' : ''} ${disabled ? 'is-disabled' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        if (!disabled) receive(event.dataTransfer.files)
      }}
    >
      <span className="conversion-drop-icon" aria-hidden="true">
        <ScissorsIcon size={25} />
      </span>
      <p>
        {count ? 'Drop more here' : <>Drop your <em>{conversion.sourceLabel}</em> files here</>}
      </p>
      <span>or</span>
      <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled}>
        Browse files
      </button>
      <small>{count ? `${MAX_FILES - count} places left in this batch` : `Select up to ${MAX_FILES} files at once`}</small>
      <input
        ref={inputRef}
        type="file"
        accept={conversion.accept}
        multiple
        hidden
        onChange={(event) => {
          receive(event.target.files)
          event.target.value = ''
        }}
      />
    </div>
  )
}

function QueueRow({ item, conversion, onRemove, disabled }) {
  const statusLabel = {
    pending: 'Ready',
    converting: 'Converting…',
    done: 'Complete',
    error: 'Could not convert',
  }[item.status]

  return (
    <li className={`queue-row is-${item.status}`}>
      <span className="queue-extension">{conversion.sourceLabel}</span>
      <span className="queue-file">
        <strong title={item.file.name}>{item.file.name}</strong>
        <small>{item.error || formatBytes(item.file.size)}</small>
      </span>
      <span className="queue-status">{statusLabel}</span>
      <button
        type="button"
        className="queue-remove"
        onClick={() => onRemove(item.id)}
        disabled={disabled}
        aria-label={`Remove ${item.file.name}`}
      >
        ×
      </button>
    </li>
  )
}

export function ConversionWorkbench({ initialConversion = FALLBACK_ROUTE, embedded = false }) {
  const initial = CONVERSION_BY_ID[initialConversion] || CONVERSION_BY_ID[FALLBACK_ROUTE]
  const [conversionId, setConversionId] = useState(initial.id)
  const [customExtension, setCustomExtension] = useState('')
  const [queue, setQueue] = useState([])
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [targetQuery, setTargetQuery] = useState('')
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const storedConversion = CONVERSION_BY_ID[conversionId]
  const conversion = conversionWithCustomSource(storedConversion, customExtension)
  const fidelity = FIDELITY[conversion.fidelity]
  const targetOptions = useMemo(() => conversionsForSource(conversion.source), [conversion.source])
  const targetNeedle = targetQuery.trim().toLowerCase()
  const visibleTargets = useMemo(() => targetOptions.filter((option) =>
    !targetNeedle || [option.targetLabel, option.targetName, option.engineLabel, option.target]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(targetNeedle),
  ), [targetNeedle, targetOptions])
  const readyTargetCount = targetOptions.filter((option) => option.availability === 'ready').length
  const semanticTargetCount = targetOptions.filter((option) => option.handler !== 'universal').length
  const readySemanticTargetCount = targetOptions.filter((option) =>
    option.handler !== 'universal' && option.availability === 'ready',
  ).length

  useEffect(() => {
    if (!CONVERSION_BY_ID[initialConversion]) return
    setConversionId(initialConversion)
    setCustomExtension('')
    setQueue([])
    setSaved(false)
    setError(null)
    setTargetQuery('')
  }, [initialConversion])

  function chooseSource(source, extension = '') {
    const [firstRoute] = conversionsForSource(source)
    if (!firstRoute) return
    setConversionId(firstRoute.id)
    setCustomExtension(source === 'any' ? extension : '')
    setQueue([])
    setSaved(false)
    setError(null)
    setTargetQuery('')
  }

  function chooseTarget(nextId) {
    setConversionId(nextId)
    setQueue((current) => current.map((item) => ({ ...item, status: 'pending', error: null })))
    setSaved(false)
    setError(null)
  }

  function addFiles(incoming) {
    let activeConversion = conversion
    const allMatchCurrent = incoming.every((file) => matchesSource(file, conversion))

    if (!queue.length && incoming.length && !allMatchCurrent) {
      const detectedSources = incoming.map((file) => sourceForFilename(file.name))
      const uniqueSources = new Set(detectedSources.filter(Boolean))
      const allKnownAndSame = detectedSources.every(Boolean) && uniqueSources.size === 1

      if (allKnownAndSame) {
        const [detectedSource] = uniqueSources
        const [detectedRoute] = conversionsForSource(detectedSource)
        if (detectedRoute) {
          activeConversion = detectedRoute
          setConversionId(detectedRoute.id)
          setCustomExtension('')
        }
      } else {
        const detectedExtensions = incoming.map((file) => extensionFromFilename(file.name))
        const uniqueExtensions = new Set(detectedExtensions)
        if (uniqueExtensions.size === 1) {
          const [extension] = uniqueExtensions
          const [anyRoute] = conversionsForSource('any')
          activeConversion = conversionWithCustomSource(anyRoute, extension)
          setConversionId(anyRoute.id)
          setCustomExtension(extension)
        }
      }
    }

    const valid = incoming.filter((file) => matchesSource(file, activeConversion))
    const rejected = incoming.length - valid.length
    const available = Math.max(0, MAX_FILES - queue.length)
    const accepted = valid.slice(0, available)
    const overLimit = valid.length - accepted.length

    if (accepted.length) {
      setQueue((current) => [
        ...current,
        ...accepted.map((file) => ({
          id: `${Date.now()}-${fileSequence++}`,
          file,
          status: 'pending',
          error: null,
        })),
      ])
      setSaved(false)
    }

    const messages = []
    if (rejected) messages.push(`${rejected} ${rejected === 1 ? 'file was' : 'files were'} not ${activeConversion.sourceLabel}`)
    if (overLimit) messages.push(`${overLimit} ${overLimit === 1 ? 'file was' : 'files were'} beyond the ${MAX_FILES}-file limit`)
    setError(messages.length ? `${messages.join('; ')} and ${messages.length > 1 ? 'were' : 'was'} not added.` : null)
  }

  function updateQueueItem(id, patch) {
    setQueue((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  async function runConversion() {
    if (!queue.length || busy) return
    if (conversion.availability !== 'ready') {
      setError(`${conversion.engineLabel || 'The required engine'} must be connected before this researched route can run.`)
      return
    }
    setBusy(true)
    setSaved(false)
    setError(null)
    setProgress({ current: 0, total: queue.length })
    setQueue((current) => current.map((item) => ({ ...item, status: 'pending', error: null })))

    let completedCount = 0
    let singleResult = null
    let failed = 0
    const usedNames = new Set()
    const archiveChunks = []
    let resolveArchive
    let rejectArchive
    const archiveDone = queue.length > 1
      ? new Promise((resolve, reject) => {
          resolveArchive = resolve
          rejectArchive = reject
        })
      : null
    const archive = queue.length > 1
      ? new Zip((archiveError, data, final) => {
          if (archiveError) rejectArchive(archiveError)
          else {
            if (data?.length) archiveChunks.push(data)
            if (final) resolveArchive()
          }
        })
      : null

    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index]
      updateQueueItem(item.id, { status: 'converting', error: null })
      setProgress({ current: index + 1, total: queue.length })
      try {
        const result = await convertFile(item.file, conversion)
        if (archive) {
          const entry = new ZipPassThrough(uniqueFilename(result.filename, usedNames))
          archive.add(entry)
          entry.push(result.bytes, true)
        } else {
          singleResult = result
        }
        completedCount += 1
        updateQueueItem(item.id, { status: 'done' })
      } catch (conversionError) {
        console.error(conversionError)
        failed += 1
        updateQueueItem(item.id, {
          status: 'error',
          error: conversionError?.message || 'This file could not be converted.',
        })
      }
    }

    if (archive) {
      archive.end()
      try {
        await archiveDone
      } catch (archiveError) {
        console.error(archiveError)
        setError('The converted files were created, but the batch ZIP could not be finalised.')
        setSaved(false)
        setBusy(false)
        return
      }
    }

    if (singleResult && queue.length === 1) {
      downloadBytes(singleResult.bytes, singleResult.filename, singleResult.mime)
    } else if (completedCount) {
      downloadBlob(
        new Blob(archiveChunks, { type: 'application/zip' }),
        `massicot-${conversion.sourceLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-to-${conversion.target}-${completedCount}-files.zip`,
      )
    }

    if (failed) {
      setError(
        completedCount
          ? `${failed} ${failed === 1 ? 'file' : 'files'} could not be converted. The ${completedCount} successful ${completedCount === 1 ? 'copy is' : 'copies are'} in your download.`
          : 'None of the files could be converted. Check the messages beside each file.',
      )
    }
    setSaved(completedCount > 0)
    setBusy(false)
  }

  return (
    <div className={`conversion-workbench ${embedded ? 'is-embedded' : ''}`}>
      {error && (
        <div className="notice conversion-notice" role="alert">
          <span className="notice-mark">!</span> {error}
        </div>
      )}

      <div className="conversion-trust" aria-label="Conversion guarantees">
        <span><i aria-hidden="true">01</i> Runs on your machine</span>
        <span><i aria-hidden="true">02</i> Originals stay untouched</span>
        <span><i aria-hidden="true">03</i> Up to {MAX_FILES} files</span>
      </div>

      <div className="conversion-board">
        <section className="conversion-side conversion-from" aria-labelledby="from-title">
          <div className="conversion-side-head">
            <span className="conversion-step">01</span>
            <div>
              <p>Source files</p>
              <h3 id="from-title">From</h3>
            </div>
          </div>
          <FormatPicker
            value={conversion.source}
            customExtension={customExtension}
            onChange={chooseSource}
            disabled={busy}
          />
          <SourceDrop
            conversion={conversion}
            count={queue.length}
            onFiles={addFiles}
            disabled={busy || queue.length >= MAX_FILES}
          />
        </section>

        <div className="conversion-direction" aria-hidden="true">
          <span>→</span>
        </div>

        <section className="conversion-side conversion-to" aria-labelledby="to-title">
          <div className="conversion-side-head">
            <span className="conversion-step">02</span>
            <div>
              <p>Available for {conversion.sourceLabel}</p>
              <h3 id="to-title">To</h3>
            </div>
          </div>
          <div className="target-toolbar">
            <label>
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={targetQuery}
                onChange={(event) => setTargetQuery(event.target.value)}
                placeholder="Search output extension…"
                aria-label="Search output extensions"
              />
            </label>
            <small>
              {targetOptions.length} researched · {readyTargetCount} ready here
            </small>
          </div>
          {semanticTargetCount === 0 ? (
            <p className="target-audit-note">
              No verified semantic converter was found for this extension. Exact ZIP, Base64 and data-URI preservation remain available.
            </p>
          ) : readySemanticTargetCount === 0 ? (
            <p className="target-audit-note">
              Semantic routes are documented below, but all require a specialist engine. Exact preservation routes are ready now.
            </p>
          ) : null}
          <div className="target-options" role="group" aria-label={`Formats ${conversion.sourceLabel} can be converted to`}>
            {visibleTargets.map((option) => (
              <button
                type="button"
                key={option.id}
                className={`${option.id === conversion.id ? 'is-selected' : ''} ${option.availability !== 'ready' ? 'is-engine-required' : ''}`}
                onClick={() => chooseTarget(option.id)}
                disabled={busy}
                title={option.targetName || option.targetLabel}
              >
                <span>{option.targetLabel}</span>
                <small>
                  {option.availability === 'ready'
                    ? `Ready · ${FIDELITY[option.fidelity].short}`
                    : `${option.engineLabel} needed`}
                </small>
                <i aria-hidden="true">{option.id === conversion.id ? '✓' : '→'}</i>
              </button>
            ))}
            {!visibleTargets.length && (
              <p className="target-empty">No researched output extension matches “{targetQuery}”.</p>
            )}
          </div>
          <div className={`fidelity-card is-${conversion.fidelity} ${conversion.availability !== 'ready' ? 'is-engine-required' : ''}`}>
            <div className="fidelity-head">
              <span className="fidelity-seal" aria-hidden="true">{conversion.availability === 'ready' ? 'Q' : 'E'}</span>
              <strong>
                {conversion.availability === 'ready' ? fidelity.label : `${conversion.engineLabel} required`}
              </strong>
            </div>
            <p>{conversion.note}</p>
            <dl className="preservation-grid" aria-label="Route preservation contract">
              {Object.entries(conversion.preservation.dimensions)
                .filter(([, level]) => level !== 'not-applicable')
                .map(([dimension, level]) => (
                  <div key={dimension} className={`is-${PRESERVATION_LEVELS[level].tone}`}>
                    <dt>{PRESERVATION_DIMENSIONS[dimension]}</dt>
                    <dd>{PRESERVATION_LEVELS[level].label}</dd>
                  </div>
                ))}
            </dl>
            <div className={`quality-gate-line is-${conversion.qualityGate.status}`}>
              <strong>{conversion.qualityGate.status === 'passed' ? '✓ Fidelity gate passed' : '◇ Activation gate pending'}</strong>
              <span>{conversion.qualityGate.label} · {conversion.qualityGate.checks.length} checks</span>
            </div>
            <small>
              {fidelity.detail}
              {conversion.provenanceUrl && (
                <> · <a href={conversion.provenanceUrl} target="_blank" rel="noreferrer">Capability source</a></>
              )}
            </small>
          </div>
        </section>
      </div>

      {queue.length > 0 && (
        <section className="conversion-queue" aria-labelledby="queue-title">
          <div className="queue-head">
            <div>
              <p className="conversion-route-kicker">Batch manifest</p>
              <h3 id="queue-title">{queue.length} {queue.length === 1 ? 'file' : 'files'} ready</h3>
            </div>
            <button
              type="button"
              className="queue-clear"
              onClick={() => {
                setQueue([])
                setError(null)
                setSaved(false)
              }}
              disabled={busy}
            >
              Clear all
            </button>
          </div>
          <ul className="queue-list">
            {queue.map((item) => (
              <QueueRow
                key={item.id}
                item={item}
                conversion={conversion}
                disabled={busy}
                onRemove={(id) => {
                  setQueue((current) => current.filter((candidate) => candidate.id !== id))
                  setSaved(false)
                }}
              />
            ))}
          </ul>
        </section>
      )}

      <div className="conversion-action">
        <div className="conversion-action-copy">
          {busy ? (
            <>
              <strong>Converting {progress.current} of {progress.total}</strong>
              <span>Please keep this tab open while the local batch is prepared.</span>
            </>
          ) : saved ? (
            <>
              <strong className="is-saved">✓ Download prepared</strong>
              <span>Your original files were never changed.</span>
            </>
          ) : conversion.availability !== 'ready' ? (
            <>
              <strong>{conversion.sourceLabel} → {conversion.targetLabel} is documented</strong>
              <span>{conversion.engineLabel} must be connected before this route can run locally.</span>
            </>
          ) : (
            <>
              <strong>{conversion.sourceLabel} → {conversion.targetLabel}</strong>
              <span>{queue.length > 1 ? 'Successful copies arrive in one ZIP archive.' : 'The converted copy downloads when ready.'}</span>
            </>
          )}
        </div>
        {busy && (
          <div className="conversion-progress" aria-hidden="true">
            <i style={{ width: `${Math.max(4, (progress.current / progress.total) * 100)}%` }} />
          </div>
        )}
        <button
          type="button"
          className="btn btn-cut conversion-submit"
          onClick={runConversion}
          disabled={!queue.length || busy || conversion.availability !== 'ready'}
        >
          {busy
            ? 'Converting…'
            : conversion.availability !== 'ready'
              ? `${conversion.engineLabel} required`
              : `Convert ${queue.length || ''} ${queue.length === 1 ? 'file' : 'files'}`.replace('  ', ' ')}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  )
}

export default function ConversionDesk({ initialConversion, onBack }) {
  return (
    <ToolShell
      no="C01"
      title="The Conversion Desk"
      tagline="Choose a source, see only its valid destinations, then convert as many as 50 files in one local batch."
      onBack={onBack}
    >
      <ConversionWorkbench initialConversion={initialConversion} />
    </ToolShell>
  )
}
