import { useState } from 'react'
import Home from './components/Home.jsx'
import Separator from './components/Separator.jsx'
import Binder from './components/Binder.jsx'
import Press from './components/Press.jsx'
import Turntable from './components/Turntable.jsx'
import Stamp from './components/Stamp.jsx'
import Composer from './components/Composer.jsx'
import Guillotine from './components/Guillotine.jsx'
import Album from './components/Album.jsx'
import Darkroom from './components/Darkroom.jsx'
import Typesetter from './components/Typesetter.jsx'
import Scribe from './components/Scribe.jsx'
import Ledger from './components/Ledger.jsx'
import ConversionDesk from './components/ConversionDesk.jsx'

const TOOL_COMPONENTS = {
  separator: Separator,
  binder: Binder,
  press: Press,
  turntable: Turntable,
  stamp: Stamp,
  composer: Composer,
  guillotine: Guillotine,
  album: Album,
  darkroom: Darkroom,
  typesetter: Typesetter,
  scribe: Scribe,
  ledger: Ledger,
}

export default function App() {
  const [view, setView] = useState('home')
  const ActiveTool = TOOL_COMPONENTS[view]
  const conversionId = view.startsWith('convert:') ? view.slice('convert:'.length) : null

  return (
    <div className="app">
      <div className="grain" aria-hidden="true" />

      <header className="masthead">
        <div className="microbar">
          <span className="microbar-item">Est. 2026 — a small atelier of PDF tools</span>
          <span className="microbar-item microbar-right">
            100% local <span className="microbar-sep">·</span> files never leave your machine
          </span>
        </div>
        <div className="masthead-main">
          <button className="wordmark" onClick={() => setView('home')} aria-label="Massicot — home">
            Massicot<span className="wordmark-star">*</span>
          </button>
          <div className="masthead-side">
            <span className="masthead-def">
              <em>massicot</em> (n., fr.) — the guillotine blade of the print shop
            </span>
          </div>
        </div>
      </header>

      <main className="page">
        {conversionId ? (
          <ConversionDesk
            key={view}
            initialConversion={conversionId}
            onBack={() => setView('home')}
          />
        ) : ActiveTool ? (
          <ActiveTool key={view} onBack={() => setView('home')} />
        ) : (
          <Home onOpenTool={(id) => setView(id)} />
        )}
      </main>

      <footer className="footer">
        <span>Massicot — PDF Atelier</span>
        <span className="footer-mid" aria-hidden="true">✂ — — — — — — — — — — — — — — — —</span>
        <span>No uploads · No accounts · MMXXVI</span>
      </footer>
    </div>
  )
}
