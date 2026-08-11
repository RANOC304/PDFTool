import { strToU8, unzipSync, zipSync } from 'fflate'

function convertedFilename(name, extension) {
  const stem = name.replace(/\.[^.]+$/, '')
  return `${stem} (converted).${extension}`
}

const BINARY_TARGETS = new Set(['docx', 'epub', 'odt', 'pptx'])
const SELF_CONTAINED_TARGETS = new Set(['html'])
const SIDECAR_TARGETS = new Set([
  'adoc', 'dbk', 'djot', 'dokuwiki', 'haddock', 'icml', 'jira', 'json', 'man', 'md', 'mediawiki',
  'ms', 'muse', 'native', 'opml', 'org', 'rst', 'tei', 'tex', 'texi', 'textile', 'typ',
  'vimdoc', 'xwiki', 'zimwiki',
])

const MASSICOT_HTML_CSS = `
:root{color-scheme:light;--ink:#1c1710;--muted:#6d665c;--line:#d7cfc0;--accent:#c7432f}
html{background:#f3eee4;color:var(--ink);font:17px/1.62 ui-serif,Georgia,Cambria,"Times New Roman",serif}
body{box-sizing:border-box;max-width:900px;margin:48px auto;padding:64px 72px;background:#fff;box-shadow:0 12px 38px #352b1e1c}
h1,h2,h3,h4,h5,h6{line-height:1.16;text-wrap:balance}h1{font-size:2.45rem}h2{margin-top:2.2em;padding-bottom:.25em;border-bottom:1px solid var(--line)}
p,li{max-width:72ch}a{color:#8b2f22;text-decoration-thickness:1px;text-underline-offset:.16em}img,svg,video{display:block;max-width:100%;height:auto;margin:1.5em auto}
table{width:100%;margin:1.5em 0;border-collapse:collapse;font:15px/1.45 ui-sans-serif,system-ui,sans-serif}th,td{padding:.65em .75em;border:1px solid var(--line);text-align:left;vertical-align:top}th{background:#eee6d7}
pre,code{font-family:"Cascadia Mono","SFMono-Regular",Consolas,monospace}pre{overflow:auto;padding:1.1em 1.25em;border:1px solid var(--line);background:#f8f5ee;white-space:pre-wrap}
blockquote{margin:1.5em 0;padding:.15em 1.25em;border-left:4px solid var(--accent);color:var(--muted)}
@media(max-width:700px){body{margin:0;padding:28px 22px;box-shadow:none}}
@media print{html{background:#fff}body{max-width:none;margin:0;padding:0;box-shadow:none}a{color:inherit}}
`

function packagedFilename(name, target) {
  return `${name.replace(/\.[^.]+$/, '')} (converted ${target.toUpperCase()} with media).zip`
}

function hasMissingResourceWarning(stderr = '') {
  return /could not (?:fetch|load|convert) (?:resource|image)|replacing image with description|failed to load image|unable to load image|image not found|not found in resource path/i.test(stderr)
}

export function safePandocMediaPath(name, index = 1, used = new Set()) {
  const relative = String(name || '')
    .replaceAll('\\', '/')
    .replace(/^massicot-media(?:\.zip)?\//, '')
  const parts = relative
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..' && part.toLowerCase() !== 'media')
    .map((part) => part
      .normalize('NFKC')
      .replace(/[\u0000-\u001f<>:"|?*]/g, '_')
      .replace(/[. ]+$/g, '')
      .slice(0, 100))
    .filter(Boolean)
  const leaf = parts.pop() || `resource-${index}`
  const directory = ['media', ...parts].join('/')
  const dot = leaf.lastIndexOf('.')
  const stem = dot > 0 ? leaf.slice(0, dot) : leaf
  const extension = dot > 0 ? leaf.slice(dot) : ''
  let candidate = `${directory}/${leaf}`
  let copy = 2
  while (used.has(candidate.toLowerCase())) {
    candidate = `${directory}/${stem} (${copy})${extension}`
    copy++
  }
  used.add(candidate.toLowerCase())
  return candidate
}

function safeInputName(file, extension) {
  const stem = file.name
    .replace(/\.[^.]+$/, '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'document'
  return `${stem}.${extension}`
}

export async function convertWithPandoc(file, conversion) {
  const { convert } = await import('pandoc-wasm')
  const sourceExtension = file.name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || conversion.engineSource
  const inputName = safeInputName(file, sourceExtension)
  const outputName = `massicot-output.${conversion.targetExtension}`
  const mediaArchiveName = 'massicot-media.zip'
  const options = {
    from: conversion.engineSource,
    to: conversion.engineFormat,
    standalone: true,
    'input-files': [inputName],
    'output-file': outputName,
  }

  const resources = { [inputName]: file }
  if (SELF_CONTAINED_TARGETS.has(conversion.targetExtension)) {
    options['embed-resources'] = true
    options['section-divs'] = true
    options.css = 'massicot-document.css'
    resources['massicot-document.css'] = new Blob([MASSICOT_HTML_CSS], { type: 'text/css' })
  }
  if (SIDECAR_TARGETS.has(conversion.targetExtension)) {
    options['extract-media'] = mediaArchiveName
  }
  if (!BINARY_TARGETS.has(conversion.targetExtension)) options.wrap = 'preserve'

  const result = await convert(options, null, resources)
  const outputBlob = result.files?.[outputName]

  if (!outputBlob?.size) {
    const detail = result.stderr?.trim().split(/\r?\n/).filter(Boolean).at(-1)
    throw new Error(detail || 'Pandoc could not create this output format.')
  }

  if (hasMissingResourceWarning(result.stderr)) {
    throw new Error(
      'A linked image or stylesheet was not included in this file. Embed the resource in the source document and try again; the conversion was stopped instead of omitting it.',
    )
  }

  const outputBytes = new Uint8Array(await outputBlob.arrayBuffer())
  const mediaBlob = result.files?.[mediaArchiveName]
  if (mediaBlob?.size) {
    const extracted = unzipSync(new Uint8Array(await mediaBlob.arrayBuffer()))
    const decoder = new TextDecoder()
    let rewritten = decoder
      .decode(outputBytes)
      .replaceAll(`${mediaArchiveName}/`, '')
      .replaceAll('massicot-media/', '')
    const packageEntries = {}
    const usedPaths = new Set()
    let resourceIndex = 0
    for (const [name, bytes] of Object.entries(extracted)) {
      if (name.endsWith('/')) continue
      resourceIndex++
      const relative = name.replaceAll('\\', '/').replace(/^massicot-media(?:\.zip)?\//, '')
      const safeName = safePandocMediaPath(name, resourceIndex, usedPaths)
      rewritten = rewritten
        .replaceAll(relative, safeName)
        .replaceAll(encodeURI(relative), encodeURI(safeName))
      packageEntries[safeName] = bytes
    }
    packageEntries[convertedFilename(file.name, conversion.targetExtension)] = strToU8(rewritten)
    return {
      bytes: zipSync(packageEntries, { level: 6 }),
      filename: packagedFilename(file.name, conversion.targetExtension),
      mime: 'application/zip',
    }
  }

  return {
    bytes: outputBytes,
    filename: convertedFilename(file.name, conversion.targetExtension),
    mime: conversion.targetMime || outputBlob.type || 'application/octet-stream',
  }
}
