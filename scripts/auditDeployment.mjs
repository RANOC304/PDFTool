import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const outputDirectory = 'dist'
const indexPath = resolve(root, outputDirectory, 'index.html')
const vercel = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'))

if (vercel.outputDirectory !== outputDirectory) {
  throw new Error(`Vercel must publish ${outputDirectory}/, not ${vercel.outputDirectory || 'an implicit directory'}.`)
}

if ((vercel.rewrites || []).some(({ source, destination }) =>
  source === '/(.*)' && /index\.html$/.test(destination || ''),
)) {
  throw new Error('A catch-all index.html rewrite can turn missing JavaScript into text/html responses.')
}

if (!existsSync(indexPath)) {
  throw new Error('dist/index.html is missing. Run npm run build before the deployment audit.')
}

const html = readFileSync(indexPath, 'utf8')
const assetUrls = [...html.matchAll(/(?:src|href)="(\/(?:static|assets)\/[^"?#]+)"/g)]
  .map((match) => match[1])

if (!assetUrls.length) {
  throw new Error('The production HTML does not reference any built assets.')
}

const missing = assetUrls.filter((url) => !existsSync(resolve(root, outputDirectory, url.slice(1))))
if (missing.length) {
  throw new Error(`Production HTML references missing assets: ${missing.join(', ')}`)
}

const legacyAssets = assetUrls.filter((url) => url.startsWith('/assets/'))
if (legacyAssets.length) {
  throw new Error(`Production HTML still uses the cache-poisoned /assets namespace: ${legacyAssets.join(', ')}`)
}

console.log(JSON.stringify({
  outputDirectory,
  assetNamespace: '/static/',
  referencedAssets: assetUrls.length,
  missingAssets: 0,
  catchAllHtmlRewrite: false,
}, null, 2))
