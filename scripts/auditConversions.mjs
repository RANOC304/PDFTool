import mimeDb from 'mime-db'
import {
  CONVERSIONS,
  CONVERSION_CHOICE_COUNT,
  KNOWN_EXTENSION_COUNT,
  READY_CONVERSION_CHOICE_COUNT,
  PRESERVATION_DIMENSIONS,
  PRESERVATION_LEVELS,
  QUALITY_GATE_POLICIES,
  MAGICK_LOSSLESS_TARGETS,
  FORMATS,
  SOURCE_OPTIONS,
  conversionsForSource,
  sourceForFilename,
} from '../src/conversions.js'

const registryExtensions = new Set(
  Object.values(mimeDb).flatMap((metadata) => metadata.extensions || []).map((extension) => extension.toLowerCase()),
)
const exposedExtensions = new Set(
  SOURCE_OPTIONS.flatMap((option) => option.extensions).map((extension) => extension.slice(1).toLowerCase()),
)
const missingExtensions = [...registryExtensions].filter((extension) => !exposedExtensions.has(extension))
const duplicatePairs = []
const pairs = new Set()

for (const conversion of CONVERSIONS) {
  const key = `${conversion.source}\u0000${conversion.target}`
  if (pairs.has(key)) duplicatePairs.push(key)
  pairs.add(key)
  if (!['ready', 'engine-required'].includes(conversion.availability)) {
    throw new Error(`Route ${conversion.id} has no valid availability state.`)
  }
  if (!conversion.preservation || conversion.preservation.version !== 1) {
    throw new Error(`Route ${conversion.id} has no versioned preservation contract.`)
  }
  for (const dimension of Object.keys(PRESERVATION_DIMENSIONS)) {
    const level = conversion.preservation.dimensions?.[dimension]
    if (!PRESERVATION_LEVELS[level]) {
      throw new Error(`Route ${conversion.id} has no valid ${dimension} preservation level.`)
    }
  }
  const expectedGateStatus = conversion.availability === 'ready' ? 'passed' : 'pending'
  if (!QUALITY_GATE_POLICIES[conversion.qualityGate?.policyId]) {
    throw new Error(`Route ${conversion.id} has no recognized quality-gate policy.`)
  }
  if (conversion.qualityGate.status !== expectedGateStatus || conversion.qualityGate.checks.length < 4) {
    throw new Error(`Route ${conversion.id} has an invalid ${expectedGateStatus} quality gate.`)
  }
  if (conversion.handler === 'imagemagick') {
    const sourceCategory = FORMATS[conversion.source]?.categoryId
    if (!['images', 'artwork'].includes(sourceCategory) && conversion.source !== 'ext:mng') {
      throw new Error(`Ambiguous non-image source ${conversion.source} was assigned to ImageMagick.`)
    }
    if (conversion.fidelity === 'lossless' && !MAGICK_LOSSLESS_TARGETS.has(conversion.target)) {
      throw new Error(`Route ${conversion.id} overclaims lossless image output.`)
    }
  }
}

const sourceAudits = SOURCE_OPTIONS.map((source) => {
  const routes = conversionsForSource(source.value)
  const targets = new Set(routes.map((route) => route.target))
  const requiredPreservationTargets = ['zip', 'base64', 'datauri']
  const missingPreservation = requiredPreservationTargets.filter((target) => !targets.has(target))
  if (!routes.length) throw new Error(`${source.value} has no conversion routes.`)
  if (missingPreservation.length) {
    throw new Error(`${source.value} is missing preservation targets: ${missingPreservation.join(', ')}`)
  }
  return {
    source: source.value,
    routeCount: routes.length,
    readyCount: routes.filter((route) => route.availability === 'ready').length,
    semanticCount: routes.filter((route) => route.handler !== 'universal').length,
  }
})

if (missingExtensions.length) throw new Error(`Registry extensions missing from picker: ${missingExtensions.join(', ')}`)
if (duplicatePairs.length) throw new Error(`Duplicate source/target pairs: ${duplicatePairs.slice(0, 10).join(', ')}`)
if (KNOWN_EXTENSION_COUNT !== registryExtensions.size) {
  throw new Error(`Known extension count ${KNOWN_EXTENSION_COUNT} does not match registry count ${registryExtensions.size}.`)
}
if (sourceForFilename('audit.future-extension-2026') !== null) {
  throw new Error('An unknown extension was incorrectly treated as registered.')
}

const specialistContractChecks = {
  ffmpeg: ['media', 'preserved'],
  libreoffice: ['content', 'preserved'],
  calibre: ['layout', 'reflowed'],
  gdal: ['structure', 'conditional'],
  sevenzip: ['content', 'exact'],
  assimp: ['animation', 'conditional'],
  openbabel: ['structure', 'conditional'],
  fontforge: ['layout', 'conditional'],
}
for (const [engine, [dimension, expected]] of Object.entries(specialistContractChecks)) {
  const routes = CONVERSIONS.filter((conversion) => conversion.engine === engine)
  if (!routes.length || routes.some((conversion) => conversion.preservation.dimensions[dimension] !== expected)) {
    throw new Error(`${engine} routes do not carry their domain-specific preservation contract.`)
  }
}

const engineStats = {}
for (const conversion of CONVERSIONS.filter((route) => route.engine)) {
  engineStats[conversion.engine] ||= { routes: 0, ready: 0, sources: new Set() }
  engineStats[conversion.engine].routes += 1
  engineStats[conversion.engine].ready += Number(conversion.availability === 'ready')
  engineStats[conversion.engine].sources.add(conversion.source)
}

console.log(JSON.stringify({
  registeredExtensions: registryExtensions.size,
  exposedExtensions: exposedExtensions.size,
  sourceChoices: SOURCE_OPTIONS.length,
  uniqueRoutes: CONVERSION_CHOICE_COUNT,
  readyRoutes: READY_CONVERSION_CHOICE_COUNT,
  duplicatePairs: duplicatePairs.length,
  sourcesWithoutRoutes: sourceAudits.filter((source) => source.routeCount === 0).length,
  sourcesWithoutReadyRoutes: sourceAudits.filter((source) => source.readyCount === 0).length,
  sourcesWithSemanticRoutes: sourceAudits.filter((source) => source.semanticCount > 0).length,
  exactPreservationOnlySources: sourceAudits.filter((source) => source.semanticCount === 0).length,
  engines: Object.fromEntries(Object.entries(engineStats).map(([engine, stats]) => [engine, {
    routes: stats.routes,
    ready: stats.ready,
    sources: stats.sources.size,
  }])),
}, null, 2))
