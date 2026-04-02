import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import useF1Store from '../../store/useF1Store'
import { getTrackStatus } from '../../utils/driverUtils'
import NotificationStack from '../ui/NotificationStack'
import useNotificationTriggers from '../../hooks/useNotificationTriggers'
import DataMonitor from '../dev/DataMonitor'

const NAV = [
  { to: '/',           label: 'HOME'      },
  { to: '/live',       label: 'LIVE'      },
  { to: '/season',     label: 'SEASON'    },
  { to: '/standings',  label: 'STANDINGS' },
  { to: '/results',    label: 'RESULTS'   },
  { to: '/settings',   label: 'SETTINGS'  },
]

/**
 * getNextSessionInfo — finds the next upcoming session across all race rounds.
 * Returns { label, targetDt, isToday, isTomorrow } or null if off-season.
 */
function getNextSessionInfo(calendar) {
  const now = new Date()
  const todayStr     = now.toISOString().slice(0, 10)
  const tomorrowStr  = new Date(now.getTime() + 86400000).toISOString().slice(0, 10)

  for (const race of calendar) {
    // Build ordered session list for this round
    const sessions = []
    if (race.FirstPractice?.date)  sessions.push({ name: 'FP1',        date: race.FirstPractice.date,  time: race.FirstPractice.time })
    if (race.SecondPractice?.date) sessions.push({ name: 'FP2',        date: race.SecondPractice.date, time: race.SecondPractice.time })
    if (race.ThirdPractice?.date)  sessions.push({ name: 'FP3',        date: race.ThirdPractice.date,  time: race.ThirdPractice.time })
    if (race.Sprint?.date)         sessions.push({ name: 'SPRINT',     date: race.Sprint.date,         time: race.Sprint.time })
    if (race.Qualifying?.date)     sessions.push({ name: 'QUALIFYING', date: race.Qualifying.date,     time: race.Qualifying.time })
    if (race.date)                 sessions.push({ name: 'RACE',       date: race.date,                time: race.time ?? '12:00:00Z' })

    for (const s of sessions) {
      const dt = new Date(`${s.date}T${s.time ?? '12:00:00Z'}`)
      if (dt > now) {
        return {
          label:      `${race.raceName?.replace(' Grand Prix', ' GP') ?? ''} — ${s.name}`,
          targetDt:   dt,
          isToday:    s.date === todayStr,
          isTomorrow: s.date === tomorrowStr,
        }
      }
    }
  }
  return null
}

function Countdown({ targetDate }) {
  const [diff, setDiff] = useState(null)

  useEffect(() => {
    if (!targetDate) return
    const tick = () => {
      const ms = targetDate - Date.now()
      if (ms <= 0) { setDiff(null); return }
      const d = Math.floor(ms / 86400000)
      const h = Math.floor((ms % 86400000) / 3600000)
      const m = Math.floor((ms % 3600000) / 60000)
      const s = Math.floor((ms % 60000) / 1000)
      setDiff({ d, h, m, s })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetDate])

  if (!diff) return null
  if (diff.d > 0) {
    return (
      <span className="font-mono text-xs text-pitwall-dim tracking-wide">
        {diff.d}D {String(diff.h).padStart(2, '0')}H {String(diff.m).padStart(2, '0')}M {String(diff.s).padStart(2, '0')}S
      </span>
    )
  }
  return (
    <span className="font-mono text-xs text-pitwall-dim tracking-wide">
      {String(diff.h).padStart(2, '0')}H {String(diff.m).padStart(2, '0')}M {String(diff.s).padStart(2, '0')}S
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
    ? 'bg-status-red text-white'
    : ts.severity === 'yellow'
    ? 'bg-status-yellow text-black'
    : ''

  return (
    <div className="flex flex-col min-h-screen bg-pitwall-bg">
      {/* ── Top bar ────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 h-12 bg-pitwall-surface border-b border-pitwall-border flex items-center px-4 gap-4">
        {/* Logo */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="w-2 h-2 rounded-full bg-status-red" />
          <span className="font-display font-bold text-xl tracking-widest text-white uppercase">
            PITWALL
          </span>
        </div>

        {/* Centre — session status OR next session countdown */}
        <div className="flex-1 flex items-center justify-center gap-3">
          {isLive ? (
            <>
              <span className="led-dot green" />
              <span className="font-display text-sm font-bold tracking-wider text-status-red uppercase px-2 py-0.5 bg-status-red/20 border border-status-red/30">
                LIVE
              </span>
              <span className="font-mono text-sm text-white">
                {session.name ?? 'SESSION'} — LAP {session.lap ?? '—'}/{session.total_laps ?? '—'}
              </span>
              {ts.severity !== 'green' && (
                <span className={`text-xs font-mono font-bold px-2 py-0.5 ${tsBadgeClass}`}>
                  ⚠ {ts.label}
                </span>
              )}
            </>
          ) : nextSession ? (
            <>
              <span className="led-dot dim" />
              {nextSession.isToday ? (
                <span className="font-mono text-[10px] text-status-yellow border border-status-yellow/30 px-1.5 py-0.5 tracking-widest">
                  TODAY
                </span>
              ) : nextSession.isTomorrow ? (
                <span className="font-mono text-[10px] text-[#888] border border-[#333] px-1.5 py-0.5 tracking-widest">
                  TOMORROW
                </span>
              ) : null}
              <span className="font-display text-sm tracking-wider text-pitwall-dim uppercase">
                {nextSession.label}
              </span>
              <Countdown targetDate={nextSession.targetDt} />
            </>
          ) : (
            <>
              <span className="led-dot dim" />
              <span className="font-display text-sm tracking-wider text-pitwall-dim uppercase">
                OFF SEASON
              </span>
            </>
          )}
        </div>

        {/* Right — WS connection */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`led-dot ${wsConnected ? 'green' : 'dim'}`} />
          <span className="font-mono text-xs text-pitwall-dim">
            {wsConnected ? 'connected' : 'offline'}
          </span>
        </div>
      </header>

      {/* ── Nav tabs ───────────────────────────────────────────── */}
      <nav className="fixed top-12 left-0 right-0 z-40 h-9 bg-pitwall-surface border-b border-pitwall-border flex items-center px-4">
        {NAV.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center h-full px-4 font-display text-xs tracking-widest uppercase transition-colors ${
                isActive
                  ? 'text-white border-b-2 border-status-red'
                  : 'text-pitwall-dim hover:text-pitwall-text border-b-2 border-transparent'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      {/* ── Main content (offset for 48px header + 36px nav = 84px) */}
      <main className="flex-1 mt-[84px] mb-7 overflow-auto">
        {children}
      </main>

      {/* ── Notification stack — top right ───────────── */}
      <NotificationStack />

      {/* ── Dev data monitor (DEV only) ──────────────── */}
      {import.meta.env.DEV && <DataMonitor />}
    </div>
  )
}
