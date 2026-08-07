import { TOOLS } from '../tools.js'
import {
  CONVERSION_CHOICE_COUNT,
  CONVERSION_GROUPS,
  CONVERSIONS,
  REVERSIBLE_PAIRS,
} from '../conversions.js'
import { ScissorsIcon } from './ToolShell.jsx'

const FEATURED_CONVERSIONS = new Set(['psd-docx', 'psd-xlsx'])
const REVERSIBLE_BY_ROUTE = new Map(
  REVERSIBLE_PAIRS.flatMap((pair) => [
    [pair.forward.id, pair],
    [pair.reverse.id, pair],
  ]),
)
const CATALOGUE_GROUPS = CONVERSION_GROUPS.map((group) => ({
  ...group,
  items: group.routes.flatMap((item) => {
    const pair = REVERSIBLE_BY_ROUTE.get(item.id)
    if (!pair) return [{ type: 'route', route: item }]
    return pair.forward.id === item.id ? [{ type: 'pair', pair }] : []
  }),
}))

function CropMarks() {
  return (
    <span className="cropmarks" aria-hidden="true">
      <i className="crop crop-tl" />
      <i className="crop crop-tr" />
      <i className="crop crop-bl" />
      <i className="crop crop-br" />
    </span>
  )
}

function ConversionCatalogue({ onOpenTool }) {
  return (
    <section className="conversion-catalogue" aria-labelledby="conversion-heading">
      <div className="tearline conversion-tear" aria-hidden="true">
        <ScissorsIcon />
      </div>

      <div className="conversion-heading reveal" style={{ '--d': '0ms' }}>
        <div>
          <p className="hero-kicker">Collection II · The conversion desk</p>
          <h2 id="conversion-heading" className="conversion-title">
            One file. <em>Another form.</em>
          </h2>
        </div>
        <div className="conversion-heading-copy">
          <span className="conversion-count">
            {CONVERSION_CHOICE_COUNT} choices · {CONVERSIONS.length} directions
          </span>
          <p>
            Images, documents, data and layered artwork — converted privately,
            without sending the original anywhere.
          </p>
        </div>
      </div>

      <div className="conversion-legend reveal" style={{ '--d': '90ms' }} aria-label="Conversion direction legend">
        <span><i aria-hidden="true">→</i> One-way</span>
        <span><i aria-hidden="true">⇄</i> Either direction</span>
      </div>

      <div className="conversion-groups">
        {CATALOGUE_GROUPS.map((group, groupIndex) => (
          <article
            key={group.id}
            className="conversion-group reveal"
            style={{ '--d': `${200 + groupIndex * 55}ms` }}
          >
            <CropMarks />
            <span className="conversion-group-no">0{groupIndex + 1}</span>
            <p className="conversion-group-eyebrow">{group.eyebrow}</p>
            <h3>{group.title}</h3>
            <p className="conversion-group-copy">{group.copy}</p>
            <div className="conversion-routes" aria-label={`${group.title} conversion routes`}>
              {group.items.map((item) => {
                if (item.type === 'pair') {
                  return (
                    <button
                      key={item.pair.id}
                      className="conversion-chip is-reversible"
                      onClick={() => onOpenTool(`convert:${item.pair.forward.id}`)}
                      aria-label={`Convert between ${item.pair.forward.sourceLabel} and ${item.pair.reverse.sourceLabel}`}
                    >
                      <span>{item.pair.forward.sourceLabel}</span>
                      <i aria-hidden="true">⇄</i>
                      <strong>{item.pair.reverse.sourceLabel}</strong>
                      <small>2-way</small>
                    </button>
                  )
                }
                const route = item.route
                return (
                  <button
                    key={route.id}
                    className={`conversion-chip ${FEATURED_CONVERSIONS.has(route.id) ? 'is-featured' : ''}`}
                    onClick={() => onOpenTool(`convert:${route.id}`)}
                    aria-label={`Convert ${route.sourceLabel} to ${route.targetLabel}`}
                  >
                    <span>{route.sourceLabel}</span>
                    <i aria-hidden="true">→</i>
                    <strong>{route.targetLabel}</strong>
                  </button>
                )
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export default function Home({ onOpenTool }) {
  return (
    <section className="home">
      <div className="hero">
        <p className="hero-kicker reveal" style={{ '--d': '0ms' }}>
          Nº 001 — {TOOLS[TOOLS.length - 1].no} · The collection
        </p>
        <h1 className="hero-title">
          <span className="hero-line reveal" style={{ '--d': '60ms' }}>
            Every page
          </span>
          <span className="hero-line reveal" style={{ '--d': '140ms' }}>
            has its <em className="hero-em">place.</em>
          </span>
        </h1>
        <p className="hero-sub reveal" style={{ '--d': '240ms' }}>
          Cut, bind, press and stamp your PDFs on your own machine —
          nothing is ever uploaded, nothing is ever kept.
        </p>
      </div>

      <div className="tearline" aria-hidden="true">
        <ScissorsIcon />
      </div>

      <div className="tool-grid">
        {TOOLS.map((tool, i) => {
          const ready = tool.status === 'ready'
          return (
            <button
              key={tool.id}
              className={`tool-card reveal ${ready ? 'is-ready' : 'is-soon'}`}
              style={{ '--d': `${300 + i * 50}ms` }}
              onClick={() => ready && onOpenTool(tool.id)}
              disabled={!ready}
            >
              <CropMarks />
              <span className="tool-top">
                <span className="tool-no">Nº {tool.no}</span>
                <span className={`tool-status ${ready ? 'status-ready' : 'status-soon'}`}>
                  {ready ? 'Ready' : 'In press'}
                </span>
              </span>
              <span className="tool-name">{tool.name}</span>
              <span className="tool-desc">{tool.desc}</span>
              <span className="tool-cta">{ready ? 'Open the tool →' : 'Arriving soon'}</span>
            </button>
          )
        })}
      </div>

      <ConversionCatalogue onOpenTool={onOpenTool} />
    </section>
  )
}
