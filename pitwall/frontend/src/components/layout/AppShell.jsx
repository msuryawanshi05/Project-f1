import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import useF1Store from '../../store/useF1Store'
import { getTrackStatus, formatCountdown } from '../../utils/driverUtils'
import NotificationStack from '../ui/NotificationStack'
import useNotificationTriggers from '../../hooks/useNotificationTriggers'
import DataMonitor from '../dev/DataMonitor'
import BroadcastBanner from '../ui/BroadcastBanner'

const NAV = [
  { to: '/',           label: 'HOME',      key: '1' },
  { to: '/live',       label: 'LIVE',      key: '2' },
  { to: '/season',     label: 'SEASON',    key: '3' },
  { to: '/standings',  label: 'STANDINGS', key: '4' },
  { to: '/results',    label: 'RESULTS',   key: '5' },
  { to: '/settings',   label: 'SETTINGS',  key: '6' },
]

/**
 * getNextSessionInfo — finds the next upcoming session across all race rounds.
 * Returns { label, targetDt, isToday, isTomorrow } or null if off-season.
 */
function getNextSessionInfo(calendar) {
  const now = new Date()

  for (const race of calendar) {
    // Build ordered session list for this round
    const list = []
    if (race.FirstPractice?.date)  list.push({ label: `${race.raceName.replace(' Grand Prix','')}: FP1`,  dt: new Date(`${race.FirstPractice.date}T${race.FirstPractice.time ?? '12:00:00Z'}`), date: race.FirstPractice.date })
    if (race.SecondPractice?.date) list.push({ label: `${race.raceName.replace(' Grand Prix','')}: FP2`,  dt: new Date(`${race.SecondPractice.date}T${race.SecondPractice.time ?? '12:00:00Z'}`), date: race.SecondPractice.date })
    if (race.ThirdPractice?.date)  list.push({ label: `${race.raceName.replace(' Grand Prix','')}: FP3`,  dt: new Date(`${race.ThirdPractice.date}T${race.ThirdPractice.time ?? '12:00:00Z'}`), date: race.ThirdPractice.date })
    if (race.Sprint?.date)         list.push({ label: `${race.raceName.replace(' Grand Prix','')}: SPRINT`, dt: new Date(`${race.Sprint.date}T${race.Sprint.time ?? '12:00:00Z'}`), date: race.Sprint.date })
    if (race.Qualifying?.date)     list.push({ label: `${race.raceName.replace(' Grand Prix','')}: QUALI`,  dt: new Date(`${race.Qualifying.date}T${race.Qualifying.time ?? '12:00:00Z'}`), date: race.Qualifying.date })
    if (race.date)                 list.push({ label: `${race.raceName.replace(' Grand Prix','')}: RACE`,   dt: new Date(`${race.date}T${race.time ?? '14:00:00Z'}`), date: race.date })

    for (const s of list) {
      if (s.dt >= now) {
        const today = new Date()
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)
        const todayStr = today.toISOString().slice(0, 10)
        const tomorrowStr = tomorrow.toISOString().slice(0, 10)

        return {
          label:      s.label,
          targetDt:   s.dt,
          isToday:    s.date === todayStr,
          isTomorrow: s.date === tomorrowStr,
        }
      }
    }
  }
  return null
}

function Countdown({ targetDate }) {
  const [diffSeconds, setDiffSeconds] = useState(null)

  useEffect(() => {
    if (!targetDate) return
    const tick = () => {
      const sec = Math.floor((targetDate - Date.now()) / 1000)
      if (sec <= 0) { setDiffSeconds(null); return }
      setDiffSeconds(sec)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetDate])

  if (diffSeconds === null) return null
  return (
    <span
      className="font-mono text-xs tracking-wide"
      style={{ color: 'var(--pw-text-strong)' }}
      aria-live="off"
      aria-label={`${formatCountdown(diffSeconds)} until session`}
    >
      {formatCountdown(diffSeconds)}
    </span>
  )
}

export default function AppShell({ children, wsConnected }) {
  const session     = useF1Store((s) => s.session)
  const trackStatus = useF1Store((s) => s.trackStatus)
  const calendar    = useF1Store((s) => s.calendar)

  // Mount notification trigger watchers
  useNotificationTriggers()

  const isLive  = ['LIVE', 'RACE', 'QUALIFYING', 'PRACTICE'].includes(session.phase)
  const ts      = getTrackStatus(trackStatus.status)

  // Session-aware next session info
  const nextSession = getNextSessionInfo(calendar)

  // Track status badge colour
  const tsBadgeClass = ts.severity === 'red'
    ? 'bg-[#E10600] text-white'
    : ts.severity === 'yellow'
    ? 'bg-[#FFF200] text-black'
    : ''

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--pw-bg)' }}>
      {/* Sleek top red stripe */}
      <div className="fixed top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-status-red via-[#FF5F5A] to-status-red z-50" aria-hidden="true" />

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header
        role="banner"
        className="fixed top-[2px] left-0 right-0 z-50 h-12 flex items-center px-4 gap-4 border-b border-pitwall-border glass-panel"
      >
        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0 bg-pitwall-surface border border-pitwall-border px-3 py-1 rounded-sm clip-skew">
          <span className={`w-2 h-2 rounded-full led-dot ${wsConnected ? 'green' : 'dim'} clip-skew-cancel`} aria-hidden="true" />
          <span className="font-display font-extrabold text-sm tracking-widest uppercase text-pitwall-text-strong clip-skew-cancel">
            PITWALL
          </span>
        </div>

        {/* Centre — session status OR next session countdown */}
        <div className="flex-1 flex items-center justify-center gap-3">
          {isLive ? (
            <div className="flex items-center gap-3 bg-status-red/10 border border-status-red/30 px-3 py-1 rounded-sm">
              <span className="led-dot red" aria-hidden="true" />
              <span className="font-display text-xs font-bold tracking-widest text-status-red uppercase">
                LIVE TIMING
              </span>
              <span className="font-mono text-xs font-semibold text-pitwall-text-strong tracking-wide">
                {session.name?.toUpperCase() ?? 'SESSION'} · LAP {session.lap ?? '—'}/{session.total_laps ?? '—'}
              </span>
              {ts.severity !== 'green' && (
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 animate-pulse ${tsBadgeClass}`}>
                  ⚠ {ts.label.toUpperCase()}
                </span>
              )}
            </div>
          ) : nextSession ? (
            <div className="flex items-center gap-3 bg-pitwall-surface border border-pitwall-border px-3 py-1 rounded-sm">
              <span className="led-dot dim" aria-hidden="true" />
              {nextSession.isToday ? (
                <span className="font-mono text-[9px] text-status-yellow border border-status-yellow/40 px-1.5 py-0.5 tracking-widest uppercase">
                  TODAY
                </span>
              ) : nextSession.isTomorrow ? (
                <span className="font-mono text-[9px] border px-1.5 py-0.5 tracking-widest uppercase"
                  style={{ color: 'var(--pw-dim)', borderColor: 'var(--pw-border)' }}>
                  TOMORROW
                </span>
              ) : null}
              <span className="font-display text-xs font-semibold uppercase tracking-wider text-pitwall-dim">
                {nextSession.label}
              </span>
              <Countdown targetDate={nextSession.targetDt} />
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-pitwall-surface border border-pitwall-border px-3 py-1 rounded-sm">
              <span className="led-dot dim" aria-hidden="true" />
              <span className="font-display text-xs font-semibold tracking-widest uppercase text-pitwall-ghost">
                OFF SEASON
              </span>
            </div>
          )}
        </div>

        {/* Right — WS connection status + shortcuts hint */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div
            role="status"
            aria-label={`WebSocket: ${wsConnected ? 'connected' : 'disconnected'}`}
            className="flex items-center gap-1.5 bg-pitwall-surface border border-pitwall-border px-2 py-0.5 rounded-sm"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-status-green' : 'bg-pitwall-ghost'}`} aria-hidden="true" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-pitwall-dim">
              {wsConnected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>

          {/* ? shortcut hint button */}
          <button
            onClick={() => window.__pitwall_openShortcuts?.()}
            className="font-mono text-[11px] text-pitwall-ghost hover:text-pitwall-text-strong transition-colors w-6 h-6 flex items-center justify-center border border-pitwall-border rounded-sm hover:border-pitwall-ghost"
            aria-label="Show keyboard shortcuts (?)"
            title="Keyboard shortcuts (?)"
          >
            ?
          </button>
        </div>
      </header>

      {/* ── Nav tabs ────────────────────────────────────────────── */}
      <nav
        role="navigation"
        aria-label="Main navigation"
        className="fixed top-14 left-0 right-0 z-40 h-9 border-b border-pitwall-border flex items-center px-4 glass-panel bg-carbon"
      >
        {NAV.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className="flex items-center h-full px-5 font-display text-xs tracking-widest uppercase transition-colors relative select-none"
            role="tab"
          >
            {({ isActive }) => (
              <>
                <span className={`relative z-10 font-bold transition-colors ${isActive ? 'text-pitwall-text-strong' : 'text-pitwall-ghost hover:text-pitwall-text-strong'}`}>
                  {label}
                </span>
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-status-red"
                    transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── Main content ────────────────────────────────────────── */}
      <main
        role="main"
        id="main-content"
        className="flex-1 mt-[104px] mb-7 overflow-auto"
        style={{ background: 'var(--pw-bg)' }}
        tabIndex={-1}
      >
        {/* Polite live region for timing updates */}
        <div aria-live="polite" aria-atomic="false" className="sr-only" id="timing-announcer" />

        {children}
      </main>

      {/* ── Notification stack — top right ──────────────────────── */}
      <NotificationStack />

      {/* ── Dev data monitor (DEV only) ─────────────────────────── */}
      {import.meta.env.DEV && <DataMonitor />}
    </div>
  )
}
