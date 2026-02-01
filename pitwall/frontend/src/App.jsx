import { Routes, Route, NavLink } from 'react-router-dom'
import { useWebSocket } from './hooks/useWebSocket'
import { useJolpica } from './hooks/useJolpica'
import Home from './pages/Home'
import Live from './pages/Live'
import Season from './pages/Season'
import Standings from './pages/Standings'
import Results from './pages/Results'
import Settings from './pages/Settings'

function App() {
  // Mount both hooks at app level — they run for the entire app lifetime
  const { connected } = useWebSocket()
  const { loading: jolpicaLoading, error: jolpicaError } = useJolpica()

  const wsStatus = connected ? 'connected' : 'disconnected'
  const jolpicaStatus = jolpicaError
    ? `error: ${jolpicaError}`
    : jolpicaLoading
    ? 'loading'
    : 'loaded'

  return (
    <div>
      {/* Debug status bar — replaced in Phase 9 by real status bar */}
      <div id="debug-bar" style={{ padding: '4px 8px', fontSize: '12px', background: '#111' }}>
        WS: {wsStatus} | Jolpica: {jolpicaStatus}
      </div>

      <nav style={{ padding: '1rem', display: 'flex', gap: '1rem' }}>
        <NavLink to="/">Home</NavLink>
        <NavLink to="/live">Live</NavLink>
        <NavLink to="/season">Season</NavLink>
        <NavLink to="/standings">Standings</NavLink>
        <NavLink to="/results">Results</NavLink>
        <NavLink to="/settings">Settings</NavLink>
      </nav>

      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/live" element={<Live />} />
          <Route path="/season" element={<Season />} />
          <Route path="/standings" element={<Standings />} />
          <Route path="/results" element={<Results />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
