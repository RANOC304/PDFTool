import { TOOLS } from '../tools.js'
import {
  CONVERSION_CHOICE_COUNT,
  KNOWN_EXTENSION_COUNT,
  READY_CONVERSION_CHOICE_COUNT,
} from '../conversions.js'
import { ScissorsIcon } from './ToolShell.jsx'
import { ConversionWorkbench } from './ConversionDesk.jsx'

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

function ConversionCatalogue() {
  return (
    <section className="conversion-catalogue" aria-labelledby="conversion-heading">
      <div className="tearline conversion-tear" aria-hidden="true">
        <ScissorsIcon />
      </div>

      <div className="conversion-heading reveal" style={{ '--d': '0ms' }}>
        <div>
          <p className="hero-kicker">Collection II · The conversion desk</p>
          <h2 id="conversion-heading" className="conversion-title">
            Any file. <em>Another form.</em>
          </h2>
        </div>
        <div className="conversion-heading-copy">
          <span className="conversion-count">
            {KNOWN_EXTENSION_COUNT.toLocaleString()} extensions · {CONVERSION_CHOICE_COUNT.toLocaleString()} researched routes · {READY_CONVERSION_CHOICE_COUNT.toLocaleString()} local
          </span>
          <p>
            Search every registered extension and see local conversions first. Directional
            routes that need a specialist engine stay visible and clearly identified.
          </p>
        </div>
      </div>
      <ConversionWorkbench embedded initialConversion="pdf-png" />
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

      <ConversionCatalogue />
    </section>
  )
}
