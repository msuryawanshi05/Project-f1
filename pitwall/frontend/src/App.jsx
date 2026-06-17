import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useWebSocket } from './hooks/useWebSocket'
import { useJolpica } from './hooks/useJolpica'
import ErrorBoundary from './components/ErrorBoundary'
import AppShell from './components/layout/AppShell'
import StatusBar from './components/layout/StatusBar'
import Home from './pages/Home'
import Live from './pages/Live'
import Season from './pages/Season'
import Standings from './pages/Standings'
import Results from './pages/Results'
import Settings from './pages/Settings'
import { unlockAudio } from './utils/notificationSounds'
import useF1Store from './store/useF1Store'

function App() {
  const { connected } = useWebSocket()
  useJolpica()

  const darkMode = useF1Store((s) => s.settings.darkMode)

  // ── Dark mode class toggle ──────────────────────────────────────────────────
  // When darkMode is true, add 'dark' to <html>; remove it for light mode.
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  // Unlock AudioContext on first user interaction (browser autoplay policy)
  useEffect(() => {
    unlockAudio()
  }, [])

  return (
    <ErrorBoundary>
      <AppShell wsConnected={connected}>
        <Routes>
          <Route path="/"          element={<Home />}      />
          <Route path="/live"      element={<Live />}      />
          <Route path="/season"    element={<Season />}    />
          <Route path="/standings" element={<Standings />} />
          <Route path="/results"   element={<Results />}   />
          <Route path="/settings"  element={<Settings />}  />
        </Routes>
      </AppShell>
      <StatusBar />
    </ErrorBoundary>
  )
}

export default App
