import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useF1Store from '../store/useF1Store'
import useRaceWeekendState from '../hooks/useRaceWeekendState'
import TrackMap from '../components/ui/TrackMap'
import RaceModal from '../components/ui/RaceModal'
import circuits from '../data/circuits.json'

// ── Countdown hook ────────────────────────────────────────────────────────────
function useCountdown(targetDate) {
  const [parts, setParts] = useState(null)
  useEffect(() => {
    if (!targetDate) return
    const tick = () => {
      const ms = new Date(targetDate) - new Date()
      if (ms <= 0) { setParts(null); return }
      setParts({
        d: Math.floor(ms / 86400000),
        h: Math.floor((ms % 86400000) / 3600000),
        m: Math.floor((ms % 3600000) / 60000),
        s: Math.floor((ms % 60000) / 1000),
      })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetDate])
  return parts
}

// ── Country flags ─────────────────────────────────────────────────────────────
const FLAGS = {
  Japan: '🇯🇵', Australia: '🇦🇺', China: '🇨🇳', Bahrain: '🇧🇭',
  'Saudi Arabia': '🇸🇦', 'United States': '🇺🇸', 'United Arab Emirates': '🇦🇪',
  Brazil: '🇧🇷', Mexico: '🇲🇽', Italy: '🇮🇹', Spain: '🇪🇸',
  Monaco: '🇲🇨', Canada: '🇨🇦', Austria: '🇦🇹', UK: '🇬🇧',
  'United Kingdom': '🇬🇧', Belgium: '🇧🇪', Netherlands: '🇳🇱',
  Hungary: '🇭🇺', Azerbaijan: '🇦🇿', Singapore: '🇸🇬',
  Qatar: '🇶🇦', 'Las Vegas': '🇺🇸', UAE: '🇦🇪', USA: '🇺🇸',
}

// ── Podium card ───────────────────────────────────────────────────────────────
function PodiumCard({ result, pos }) {
  if (!result) return <div className="flex-1 bg-[#111] border border-pitwall-border p-4 opacity-30">—</div>

  const driver     = result.Driver ?? {}
  const team       = result.Constructor?.name ?? ''
  const code       = driver.code ?? driver.driverId ?? '???'
  const familyName = driver.familyName ?? ''
  const time       = result.Time?.time ?? result.status ?? '—'

  const TEAM_COLOURS = {
    'Red Bull': '#3671C6', 'Ferrari': '#E8002D', 'Mercedes': '#27F4D2',
    'McLaren': '#FF8000', 'Aston Martin': '#229971', 'Alpine': '#FF87BC',
    'Williams': '#64C4FF', 'RB': '#6692FF', 'Haas': '#B6BABD', 'Sauber': '#52E252',
  }
  const colour = Object.entries(TEAM_COLOURS).find(([k]) =>
    team.toLowerCase().includes(k.toLowerCase())
  )?.[1] ?? '#444'

  const isWinner = pos === 1
  return (
    <div
      className={`flex-1 border border-pitwall-border p-4 flex flex-col gap-1 ${isWinner ? 'bg-[#141414]' : 'bg-pitwall-surface'}`}
      style={{ borderTop: `3px solid ${colour}` }}
    >
      <div className="font-display text-pitwall-ghost text-xs tracking-widest">P{pos}</div>
      <div className={`font-display font-bold tracking-wider text-white ${isWinner ? 'text-4xl' : 'text-2xl'}`}>
        {code}
      </div>
      <div className="font-body text-sm text-pitwall-dim">{familyName}</div>
      <div className="font-mono text-xs text-pitwall-ghost mt-1">{time}</div>
      <div className="font-body text-xs text-pitwall-ghost">{team}</div>
    </div>
  )
}

// ── Compact race card (upcoming list — now clickable) ──────────────────────────
function RaceCard({ race, onOpen }) {
  const circuitData = circuits.find((c) =>
    c.name?.toLowerCase().includes(race.raceName?.toLowerCase().replace(' grand prix', '').trim()) ||
    race.raceName?.toLowerCase().includes(c.name?.toLowerCase().replace(' grand prix', '').trim())
  )
  const flag = FLAGS[race.Circuit?.Location?.country] ?? '🏁'
  const now  = new Date()
  const isPast = new Date(race.date) < now

  return (
    <button
      onClick={() => !isPast && onOpen(race, circuitData)}
      disabled={isPast}
      className={`w-full text-left bg-pitwall-surface border border-pitwall-border p-3 flex flex-col gap-1.5 transition-all duration-150 ${
        isPast
          ? 'opacity-40 cursor-default'
          : 'hover:border-status-red/60 hover:bg-[#141414] cursor-pointer group'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-display text-xs text-pitwall-ghost tracking-widest">R{race.round}</span>
        <div className="flex items-center gap-1">
          {circuitData?.sprint && (
            <span className="font-mono text-[9px] text-status-yellow border border-status-yellow/40 px-1">S</span>
          )}
          {!isPast && (
            <span className="font-mono text-[9px] text-pitwall-ghost group-hover:text-status-red/70 transition-colors">›</span>
          )}
        </div>
      </div>
      <div className="text-lg">{flag}</div>
      <div className="font-display font-semibold text-sm text-pitwall-text tracking-wide leading-tight">
        {race.raceName?.replace(' Grand Prix', '')}
      </div>
      <div className="font-mono text-xs text-pitwall-dim">{race.date}</div>
    </button>
  )
}

// ── Race weekend session schedule (compact) ───────────────────────────────────
function WeekendSchedule({ weekendSessions }) {
  if (!weekendSessions?.length) return null
  return (
    <div className="space-y-0.5">
      {weekendSessions.map((s) => (
        <div
          key={s.key}
          className={`flex items-center gap-3 py-1.5 px-3 border border-pitwall-border ${
            s.live ? 'bg-status-green/10 border-status-green/30' : s.done ? 'opacity-40' : 'bg-pitwall-surface'
          }`}
        >
          <span className={`font-mono text-[10px] ${s.done ? 'text-pitwall-ghost' : s.live ? 'text-status-green' : 'text-pitwall-dim'}`}>
            {s.done ? '✓' : s.live ? '●' : '○'}
          </span>
          <span className={`font-mono text-xs flex-1 ${s.live ? 'text-status-green font-bold' : s.done ? 'text-pitwall-ghost' : 'text-pitwall-text'}`}>
            {s.label}
          </span>
          <span className="font-mono text-[10px] text-pitwall-ghost">
            {s.dt?.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Home page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const navigate = useNavigate()

  const calendar        = useF1Store((s) => s.calendar)
  const calendarLoading = useF1Store((s) => s.calendarLoading)
  const standings       = useF1Store((s) => s.standings)
  const results         = useF1Store((s) => s.results)

  const weekendState = useRaceWeekendState()
  const { mode, currentRace, nextSession, weekendSessions, circuitData, lastSession } = weekendState

  const isWeekend       = mode === 'WEEKEND_BETWEEN_SESSIONS' || mode === 'WEEKEND_SESSION_SOON' || mode === 'WEEKEND_UPCOMING'
  const isActiveWeekend = mode === 'WEEKEND_BETWEEN_SESSIONS' || mode === 'WEEKEND_SESSION_SOON'

  const now         = new Date()
  const pastRaces   = calendar.filter((r) => new Date(r.date) < now)
  const futureRaces = calendar.filter((r) => new Date(r.date) >= now)
  const nextRace    = currentRace ?? futureRaces[0] ?? null

  // For countdown — use the FP1/first session date
  const countdownTarget = nextSession?.targetDt ?? (nextRace ? new Date(`${nextRace.date}T${nextRace.time ?? '13:00:00Z'}`) : null)
  const countdown       = useCountdown(countdownTarget)

  const lastRound  = pastRaces[pastRaces.length - 1]
  const lastResult = lastRound ? results[lastRound.round] : null
  const podium     = lastResult && !lastResult.empty
    ? (lastResult.Results ?? []).slice(0, 3)
    : null

  const p1Driver = standings.drivers[0] ?? null
  const p2Driver = standings.drivers[1] ?? null

  const countryFlag = nextRace?.Circuit?.Location?.country ?? ''
  const heroFlag    = FLAGS[countryFlag] ?? '🏁'

  // ── Race modal state ──────────────────────────────────────────────────────
  const [modalRace,    setModalRace]    = useState(null)
  const [modalCircuit, setModalCircuit] = useState(null)

  function openModal(race, circuit) {
    setModalRace(race)
    setModalCircuit(circuit)
  }
  function closeModal() {
    setModalRace(null)
    setModalCircuit(null)
  }

  return (
    <div className="min-h-full bg-pitwall-bg">

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="border-b border-pitwall-border px-6 py-8">
        {calendarLoading ? (
          <div className="font-mono text-pitwall-dim text-sm">Loading season data…</div>
        ) : isActiveWeekend && currentRace ? (
          /* ── RACE WEEKEND ACTIVE BANNER ─────────────────────────── */
          <div className="flex flex-col lg:flex-row gap-8">
            <div className="flex-1">
              {/* Badge */}
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-status-red animate-pulse" />
                <span className="font-mono text-[10px] text-status-red tracking-widest uppercase border border-status-red/30 px-2 py-0.5">
                  Race Weekend In Progress
                </span>
                {currentRace.Circuit?.Location?.country && (
                  <span className="font-mono text-[10px] text-pitwall-ghost tracking-widest uppercase border border-pitwall-border px-2 py-0.5">
                    Round {currentRace.round}
                  </span>
                )}
              </div>

              <h1 className="font-display font-bold text-4xl text-white tracking-wide uppercase leading-none mb-2">
                {heroFlag} {currentRace.raceName}
              </h1>
              <div className="font-display text-pitwall-dim text-base tracking-widest uppercase mb-4">
                {currentRace.Circuit?.circuitName ?? circuitData?.circuit ?? ''}
              </div>

              {/* Last session done */}
              {lastSession && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono text-[10px] text-status-green border border-status-green/30 px-2 py-0.5">
                    ✓ {lastSession.label} COMPLETE
                  </span>
                </div>
              )}

              {/* Next session countdown */}
              {nextSession && countdown && (
                <div className="mt-4">
                  <div className="font-mono text-[10px] text-pitwall-ghost tracking-widest uppercase mb-2">
                    Next — {nextSession.label}
                  </div>
                  <div className="flex items-end gap-3">
                    {[
                      { val: String(countdown.h).padStart(2, '0'), label: 'hrs' },
                      { val: String(countdown.m).padStart(2, '0'), label: 'min' },
                      { val: String(countdown.s).padStart(2, '0'), label: 'sec' },
                    ].map(({ val, label }) => (
                      <div key={label} className="flex flex-col items-center">
                        <span className="countdown-unit">{val}</span>
                        <span className="countdown-label">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {nextSession && !countdown && (
                <div className="font-display text-sm text-status-red tracking-widest uppercase animate-pulse mt-4">
                  {nextSession.label} Starting Now
                </div>
              )}

              <Link
                to="/live"
                className="inline-block mt-5 font-mono text-xs tracking-widest uppercase px-4 py-2 border border-pitwall-border text-pitwall-dim hover:text-white hover:border-status-red transition-colors"
              >
                Open Live Timing →
              </Link>
            </div>

            {/* Track map side — active weekend */}
            {circuitData && (
              <div className="lg:w-72 flex-shrink-0">
                <TrackMap circuitData={circuitData} compact showStats />
              </div>
            )}
          </div>
        ) : nextRace ? (
          /* ── UPCOMING RACE HERO — Centered layout ───────────────── */
          <div className="max-w-3xl mx-auto">
            {/* Label row */}
            <div className="text-center mb-3">
              <span className="font-mono text-pitwall-ghost text-xs tracking-widest uppercase">
                {mode === 'WEEKEND_UPCOMING' ? 'Race Weekend Starting Soon' : 'Next Race'} · Round {nextRace.round}
              </span>
            </div>

            {/* Race name — centered */}
            <h1 className="font-display font-bold text-5xl text-white tracking-wide uppercase leading-none text-center mb-1">
              {heroFlag} {nextRace.raceName}
            </h1>
            <div className="font-display text-pitwall-dim text-lg tracking-widest uppercase text-center mt-1 mb-1">
              {nextRace.Circuit?.Location?.country ?? ''} · {nextRace.Circuit?.circuitName ?? ''}
            </div>
            <div className="font-mono text-sm text-pitwall-dim text-center mb-5">
              Race: {nextRace.date}
            </div>

            {/* Track map — centered, full width */}
            {circuitData && (
              <div className="max-w-md mx-auto mb-5">
                <TrackMap circuitData={circuitData} compact showStats />
              </div>
            )}

            {/* Countdown — centered */}
            {countdown && (
              <div className="text-center">
                <div className="font-mono text-pitwall-ghost text-xs tracking-widest uppercase mb-3">
                  {nextSession ? `${nextSession.label} in` : 'Race in'}
                </div>
                <div className="flex items-end gap-4 justify-center">
                  {[
                    { val: countdown.d,                              label: 'days' },
                    { val: String(countdown.h).padStart(2, '0'),    label: 'hrs'  },
                    { val: String(countdown.m).padStart(2, '0'),    label: 'min'  },
                    { val: String(countdown.s).padStart(2, '0'),    label: 'sec'  },
                  ].map(({ val, label }) => (
                    <div key={label} className="flex flex-col items-center">
                      <span className="countdown-unit">{val}</span>
                      <span className="countdown-label">{label}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => openModal(nextRace, circuitData)}
                  className="mt-5 font-mono text-xs tracking-widest uppercase px-4 py-2 border border-pitwall-border text-pitwall-dim hover:text-white hover:border-status-red transition-colors"
                >
                  Full Weekend Details →
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center">
            <h1 className="font-display font-bold text-5xl text-white tracking-wide uppercase">
              2026 F1 World Championship
            </h1>
            <div className="font-mono text-pitwall-dim text-sm mt-2">Season complete</div>
          </div>
        )}
      </section>

      <div className="flex gap-px">

        {/* ── Left column ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 border-r border-pitwall-border">

          {/* Race weekend schedule — shown during active weekends */}
          {isWeekend && weekendSessions.length > 0 && (
            <section className="p-6 border-b border-pitwall-border">
              <div className="font-mono text-pitwall-ghost text-xs tracking-widest uppercase mb-4">
                Weekend Schedule
              </div>
              <WeekendSchedule weekendSessions={weekendSessions} />
            </section>
          )}

          {/* Championship leader — clickable → Standings page */}
          {standings.drivers.length > 0 && (
            <section className="border-b border-pitwall-border group">
              <button
                onClick={() => navigate('/standings')}
                className="w-full text-left p-6 hover:bg-pitwall-surface/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="font-mono text-pitwall-ghost text-xs tracking-widest uppercase">
                    Drivers Championship
                  </div>
                  <span className="font-mono text-[10px] text-pitwall-ghost group-hover:text-status-red transition-colors tracking-widest">
                    VIEW ALL →
                  </span>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="font-display font-bold text-3xl text-white">
                    {p1Driver?.Driver?.code ?? '—'}
                  </span>
                  <span className="font-body text-pitwall-dim text-lg">
                    {p1Driver?.Driver?.familyName}
                  </span>
                  <span className="font-mono text-2xl text-white ml-auto">
                    {p1Driver?.points}<span className="text-pitwall-ghost text-sm ml-1">pts</span>
                  </span>
                </div>
                {p2Driver && (
                  <div className="font-mono text-xs text-pitwall-dim mt-2">
                    P2: {p2Driver?.Driver?.code} — {p2Driver?.points} pts
                    &nbsp;(−{(parseFloat(p1Driver?.points ?? 0) - parseFloat(p2Driver?.points ?? 0)).toFixed(0)})
                  </div>
                )}
              </button>
            </section>
          )}

          {/* Last race podium */}
          {podium ? (
            <section className="p-6 border-b border-pitwall-border">
              <div className="flex items-center justify-between mb-4">
                <div className="font-mono text-pitwall-ghost text-xs tracking-widest uppercase">
                  Last Race — {lastRound?.raceName}
                </div>
                <Link to="/results" className="font-mono text-[10px] text-pitwall-ghost hover:text-status-red transition-colors tracking-widest">
                  RESULTS →
                </Link>
              </div>
              <div className="flex gap-2 items-end">
                <PodiumCard result={podium[1]} pos={2} />
                <PodiumCard result={podium[0]} pos={1} />
                <PodiumCard result={podium[2]} pos={3} />
              </div>
            </section>
          ) : (
            <section className="p-6 border-b border-pitwall-border">
              <div className="flex items-center justify-between mb-2">
                <div className="font-mono text-pitwall-ghost text-xs tracking-widest uppercase">
                  Last Race
                </div>
                <Link to="/results" className="font-mono text-[10px] text-pitwall-ghost hover:text-status-red transition-colors tracking-widest">
                  RESULTS →
                </Link>
              </div>
              <div className="font-body text-pitwall-dim text-sm">
                {pastRaces.length === 0 ? 'Season not yet started' : 'Click Results to load race data'}
              </div>
            </section>
          )}
        </div>

        {/* ── Right column — upcoming races (clickable) ─────────────── */}
        <div className="w-72 flex-shrink-0 p-6">
          <div className="font-mono text-pitwall-ghost text-xs tracking-widest uppercase mb-4">
            Upcoming Races
          </div>
          {futureRaces.length === 0 ? (
            <div className="font-body text-pitwall-dim text-sm">Season complete</div>
          ) : (
            <div className="flex flex-col gap-2">
              {futureRaces.slice(0, 6).map((race) => {
                const cd = circuits.find((c) =>
                  c.name?.toLowerCase().includes(race.raceName?.toLowerCase().replace(' grand prix', '').trim()) ||
                  race.raceName?.toLowerCase().includes(c.name?.toLowerCase().replace(' grand prix', '').trim())
                )
                return (
                  <RaceCard
                    key={race.round}
                    race={race}
                    onOpen={(r, c) => openModal(r, c ?? cd)}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Race detail modal ──────────────────────────────────────── */}
      {modalRace && (
        <RaceModal
          race={modalRace}
          circuitData={modalCircuit}
          onClose={closeModal}
        />
      )}
    </div>
  )
}
