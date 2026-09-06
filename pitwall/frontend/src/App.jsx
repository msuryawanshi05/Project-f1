import { useEffect, useState, lazy, Suspense, useCallback } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useWebSocket } from './hooks/useWebSocket'
import { useJolpica } from './hooks/useJolpica'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useBrowserCheck } from './hooks/useBrowserCheck'
import { usePWAInstall } from './hooks/usePWAInstall'
import ErrorBoundary from './components/ErrorBoundary'
import AppShell from './components/layout/AppShell'
import StatusBar from './components/layout/StatusBar'
import KeyboardShortcutsModal from './components/ui/KeyboardShortcutsModal'
import PWAInstallBanner from './components/ui/PWAInstallBanner'
import { unlockAudio } from './utils/notificationSounds'
import useF1Store from './store/useF1Store'
import { useDynamicTitle } from './hooks/useDynamicTitle'
import { motion, AnimatePresence } from 'framer-motion'

// Lazy-load pages — reduces initial bundle by ~60%
const Home      = lazy(() => import('./pages/Home'))
const Live      = lazy(() => import('./pages/Live'))
const Season    = lazy(() => import('./pages/Season'))
const Standings = lazy(() => import('./pages/Standings'))
const Results   = lazy(() => import('./pages/Results'))
const Settings  = lazy(() => import('./pages/Settings'))
const NotFound  = lazy(() => import('./pages/NotFound'))

const BOOT_PHRASES = [
  'INITIALIZING TELEMETRY STREAM...',
  'WARMING SOFT TYRE COMPOUNDS...',
  'CALIBRATING PITWALL LINK...',
  'SYNCHRONIZING CAR SENSORS...',
  'ESTABLISHING ENCRYPTED SIGNAL...',
  'READY TO RACE.'
]

function BootLoader({ onComplete }) {
  const [index, setIndex] = useState(0)
  
  useEffect(() => {
    const phraseInterval = setInterval(() => {
      setIndex((i) => (i < BOOT_PHRASES.length - 1 ? i + 1 : i))
    }, 280)

    const timer = setTimeout(() => {
      onComplete()
    }, 1500)

    return () => {
      clearInterval(phraseInterval)
      clearTimeout(timer)
    }
  }, [onComplete])

  return (
    <motion.div
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-carbon text-white font-display uppercase tracking-widest select-none"
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
    >
      {/* Ambient background glow */}
      <div className="absolute inset-0 bg-gradient-to-tr from-[#E10600]/10 via-transparent to-[#00D2BE]/5 pointer-events-none" />

      {/* Center glowing logo element */}
      <div className="flex flex-col items-center gap-4 relative z-10">
        <motion.div 
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          className="text-4xl font-black italic tracking-widest text-[#E10600] flex items-center gap-2"
        >
          PITWALL
          <span className="w-2.5 h-2.5 rounded-full bg-[#E10600] led-dot red" />
        </motion.div>

        {/* Status Message */}
        <div className="h-6 font-mono text-[10px] text-pitwall-dim mt-2 text-center w-64">
          <motion.span
            key={index}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {BOOT_PHRASES[index]}
          </motion.span>
        </div>

        {/* Progress bar */}
        <div className="w-48 h-[2px] bg-white/10 rounded-full overflow-hidden mt-4 relative">
          <motion.div
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 1.4, ease: 'easeInOut' }}
            className="h-full bg-[#E10600]"
          />
        </div>
      </div>
    </motion.div>
  )
}

// ── Inner app — uses router context (keyboard shortcuts need useNavigate) ──────
function AppInner({ connected }) {
  const darkMode    = useF1Store((s) => s.settings.darkMode)
  const teamAccent  = useF1Store((s) => s.settings.teamAccent)
  const trackStatus = useF1Store((s) => s.trackStatus)
  const notifications = useF1Store((s) => s.notifications)

  // ── Shortcuts modal state ────────────────────────────────────────────────────
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  // Expose modal controls to window for keyboard shortcut handler
  useEffect(() => {
    window.__pitwall_openShortcuts = () => setShortcutsOpen(true)
    window.__pitwall_closePanel    = () => setShortcutsOpen(false)
    window.__pitwall_toggleFullscreen = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.()
      } else {
        document.exitFullscreen?.()
      }
    }
    return () => {
      delete window.__pitwall_openShortcuts
      delete window.__pitwall_closePanel
      delete window.__pitwall_toggleFullscreen
    }
  }, [])

  // ── Mount global keyboard shortcuts ─────────────────────────────────────────
  useKeyboardShortcuts()

  // ── Dark mode class toggle ────────────────────────────────────────────────────
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  // ── Team Accent color synchronization ─────────────────────────────────────────
  useEffect(() => {
    if (teamAccent) {
      document.documentElement.style.setProperty('--pw-red', teamAccent)
    } else {
      document.documentElement.style.removeProperty('--pw-red')
    }
  }, [teamAccent])

  // ── Browser compat check ─────────────────────────────────────────────────────
  const compatIssues = useBrowserCheck()

  // ── PWA install prompt ───────────────────────────────────────────────────────
  const { showBanner, install, dismiss } = usePWAInstall()

  // ── Live screen-reader announcer for critical events ─────────────────────────
  const criticalNotification = notifications.find(
    (n) => n.type === 'critical' && !n.dismissed
  )

  // ── Close modal on Escape (handled inside modal, but also here for safety) ───
  const handleCloseShortcuts = useCallback(() => setShortcutsOpen(false), [])

  return (
    <>
      {/* ── Skip-to-content link (first focusable element on page) ── */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[99999] focus:px-4 focus:py-2 focus:bg-status-red focus:text-white focus:rounded-sm focus:font-bold focus:font-display focus:text-xs focus:tracking-widest focus:uppercase"
      >
        Skip to main content
      </a>

      {/* ── Browser compatibility warning ────────────────────────── */}
      {compatIssues.length > 0 && (
        <div
          role="alert"
          className="fixed top-0 inset-x-0 z-[99997] bg-yellow-500 text-black text-xs px-4 py-2 text-center font-mono"
        >
          ⚠️ Your browser is missing: {compatIssues.join(', ')}.{' '}
          <a href="https://www.google.com/chrome" className="underline font-bold ml-1" target="_blank" rel="noopener noreferrer">
            Update browser
          </a>
        </div>
      )}

      {/* ── Screen reader live announcer for critical events ─────── */}
      <div
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
        id="live-announcer"
      >
        {criticalNotification && `${criticalNotification.title}: ${criticalNotification.message}`}
      </div>

      {/* ── Main app shell and routing ───────────────────────────── */}
      <AppShell wsConnected={connected}>
        <Suspense fallback={<div className="flex-1" />}>
          <Routes>
            <Route path="/"          element={<Home />}      />
            <Route path="/live"      element={<Live />}      />
            <Route path="/season"    element={<Season />}    />
            <Route path="/standings" element={<Standings />} />
            <Route path="/results"   element={<Results />}   />
            <Route path="/settings"  element={<Settings />}  />
            <Route path="*"          element={<NotFound />}  />
          </Routes>
        </Suspense>
      </AppShell>
      <StatusBar />

      {/* ── Keyboard shortcuts modal ─────────────────────────────── */}
      <KeyboardShortcutsModal isOpen={shortcutsOpen} onClose={handleCloseShortcuts} />

      {/* ── PWA install banner ───────────────────────────────────── */}
      <PWAInstallBanner showBanner={showBanner} onInstall={install} onDismiss={dismiss} />
    </>
  )
}

function App() {
  const { connected } = useWebSocket()
  useJolpica()
  useDynamicTitle()

  const [booting, setBooting] = useState(() => {
    // Only boot once per browser session
    if (sessionStorage.getItem('pitwall_booted')) return false
    return true
  })

  // Unlock AudioContext on first user interaction (browser autoplay policy)
  useEffect(() => {
    unlockAudio()
  }, [])

  return (
    <ErrorBoundary>
      <AnimatePresence>
        {booting && <BootLoader onComplete={() => { sessionStorage.setItem('pitwall_booted', '1'); setBooting(false) }} />}
      </AnimatePresence>
      <AppInner connected={connected} />
    </ErrorBoundary>
  )
}

export default App
