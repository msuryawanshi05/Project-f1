import { NavLink, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import useF1Store from '../../store/useF1Store'
import { isQualifyingSessionName, qualifyingHeaderLabel } from '../../utils/qualifyingUtils'
import { getTrackStatus, formatCountdown } from '../../utils/driverUtils'
import NotificationStack from '../ui/NotificationStack'
import useNotificationTriggers from '../../hooks/useNotificationTriggers'
import useRaceWeekendState from '../../hooks/useRaceWeekendState'
import useLiveStatus from '../../hooks/useLiveStatus'
import ReplayLauncher from '../replay/ReplayLauncher'
import DataMonitor from '../dev/DataMonitor'
import BroadcastBanner from '../ui/BroadcastBanner'

const NAV = [
  { to: '/',           label: 'HOME',      key: '1' },
  { to: '/live',       label: 'LIVE',      key: '2' },
  { to: '/season',     label: 'SEASON',    key: '3' },
  { to: '/standings',  label: 'STANDINGS', key: '4' },
  // Drivers and Teams share one nav slot (the page carries the toggle), so the
  // tab must stay highlighted on either route.
  { to: '/drivers',    label: 'DRIVERS',   key: '5', alsoMatches: ['/teams'] },
  { to: '/results',    label: 'RESULTS',   key: '6' },
  { to: '/settings',   label: 'SETTINGS',  key: '7' },
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

export default function AppShell({ children, wsConnected, connectionState = 'connecting', wsAttempts = 0 }) {
  const session     = useF1Store((s) => s.session)
  const trackStatus = useF1Store((s) => s.trackStatus)
  const calendar    = useF1Store((s) => s.calendar)

  // Mount notification trigger watchers
  useNotificationTriggers()

  // The top bar said LIVE TIMING purely from session.phase, which stays at its
  // last value after the flag. Use the resolved lifecycle so a finished session
  // is not advertised as live.
  const { pathname } = useLocation()
  const replay = useF1Store((s) => s.replay)
  const qualifying = useF1Store((s) => s.qualifying)
  const liveStatus = useLiveStatus()
  const weekendState = useRaceWeekendState()
  const isLive       = weekendState.isLive === true
  const isProvisional = weekendState.provisional === true
  const ts      = getTrackStatus(trackStatus.status)

  // Qualifying counts segments, not laps. "LAP 62/62" through a knockout
  // session is the same mistake Phase B fixed in the tower; this is the copy
  // of it that lives in the global header.
  const headerDetail = isQualifyingSessionName(session.name)
    ? qualifyingHeaderLabel(qualifying.part, qualifying.noEntries)
    : `LAP ${session.lap ?? '—'}/${session.total_laps ?? '—'}`

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
          {isLive || isProvisional ? (
            <div
              className={`flex items-center gap-3 px-3 py-1 rounded-sm border ${
                isLive
                  ? 'bg-status-red/10 border-status-red/30'
                  : 'bg-amber-500/10 border-amber-500/30'
              }`}
            >
              <span className={isLive && !replay.active ? 'led-dot red' : 'w-2 h-2 rounded-full bg-amber-400'} aria-hidden="true" />
              <span
                className={`font-display text-xs font-bold tracking-widest uppercase ${
                  isLive && !replay.active ? 'text-status-red' : 'text-amber-700 dark:text-amber-400'
                }`}
              >
                {replay.active ? 'REPLAY' : isLive ? 'LIVE TIMING' : 'PROVISIONAL'}
              </span>
              <span className="font-mono text-xs font-semibold text-pitwall-text-strong tracking-wide">
                {session.name?.toUpperCase() ?? 'SESSION'} · {headerDetail}
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
          {/* Connection pill.
              Three states, not two. A free-tier backend sleeps and takes most
              of a minute to wake, so "connecting" is where the app genuinely
              lives on a cold first load — showing OFFLINE there reads as
              broken. And once connected, LIVE would still be misleading if the
              feed itself is unavailable on this host, so the label follows the
              feed, not just the socket. */}
          {(() => {
            const feedBlocked = liveStatus.availability === 'unavailable_here'
            const waking = !wsConnected && wsAttempts >= 2
            // A replay outranks every other label here. Reading CONNECTED next
            // to a tower full of 2026 Monza timing is exactly the confusion
            // this chip exists to prevent.
            const label = replay.active
              ? 'REPLAY'
              : wsConnected
              ? (feedBlocked ? 'NO FEED' : 'CONNECTED')
              : (waking ? 'WAKING…' : 'CONNECTING…')
            const dot = replay.active
              ? 'bg-status-red'
              : wsConnected
              ? (feedBlocked ? 'bg-status-yellow' : 'bg-status-green')
              : 'bg-pitwall-ghost animate-pulse'
            const title = replay.active
              ? `Replaying ${replay.weekendName ?? 'a recorded weekend'} — ${replay.sessionLabel ?? ''}. This is not live timing.`
              : wsConnected
              ? (feedBlocked
                  ? (liveStatus.detail ?? 'Live timing is not available on this deployment.')
                  : 'Connected to the PITWALL backend.')
              : (waking
                  ? 'The backend is asleep (free tier) and is being woken. This takes up to a minute on first load.'
                  : 'Connecting to the PITWALL backend.')
            return (
              <div
                role="status"
                aria-label={`Connection: ${label}`}
                title={title}
                className="flex items-center gap-1.5 bg-pitwall-surface border border-pitwall-border px-2 py-0.5 rounded-sm"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden="true" />
                <span className="font-mono text-[10px] uppercase tracking-wider text-pitwall-dim">
                  {label}
                </span>
              </div>
            )
          })()}

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
        {NAV.map(({ to, label, alsoMatches }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className="flex items-center h-full px-5 font-display text-xs tracking-widest uppercase transition-colors relative select-none"
            role="tab"
          >
            {({ isActive: routeActive }) => {
              // A tab that owns more than one route (Drivers also owns /teams)
              // stays highlighted across all of them.
              const isActive = routeActive
                || (alsoMatches ?? []).some((prefix) => pathname.startsWith(prefix))
              return (
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
              )
            }}
          </NavLink>
        ))}
      </nav>

      {/* Live timing unavailable on this host — stated once, plainly.
          Without it a hosted instance looks broken: the socket is connected and
          nothing ever arrives. Everything else on the site is unaffected. */}
      {liveStatus.availability === 'unavailable_here' && !replay.active && (
        <div
          role="status"
          className="fixed top-[92px] left-0 right-0 z-30 flex items-center justify-center gap-2 px-4 py-1.5 border-b border-status-yellow/40 bg-status-yellow/10"
        >
          <span className="font-display text-[10px] font-bold tracking-widest uppercase text-status-yellow">
            Live timing unavailable here
          </span>
          <span className="font-mono text-[10px] text-pitwall-dim text-center">
            F1's timing feed refuses connections from this server's network. Results, standings,
            drivers, teams and session history all work normally.
          </span>
          {/* Stating the problem and offering nothing is worse than useless
              here: replay is the answer to it, and it is one click away. */}
          <ReplayLauncher compact />
        </div>
      )}

      {/* ── Main content ────────────────────────────────────────── */}
      <main
        role="main"
        id="main-content"
        className={`flex-1 ${liveStatus.availability === 'unavailable_here' && !replay.active ? 'mt-[134px]' : 'mt-[104px]'} mb-7 overflow-auto`}
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
