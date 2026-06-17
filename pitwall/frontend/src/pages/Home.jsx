/**
 * Home.jsx — PITWALL
 * 3-column layout:
 *   • Left 2/3  : race name, location, countdown, Full Weekend Details
 *   • Right 1/3 : TrackMap + stats + lap record
 * Bottom: Championship (clickable → /standings), Podium, Upcoming races (clickable)
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import useF1Store from '../store/useF1Store'
import useRaceWeekendState from '../hooks/useRaceWeekendState'
import TrackMap from '../components/ui/TrackMap'
import RaceModal from '../components/ui/RaceModal'
import circuits from '../data/circuits.json'

// ── Countdown ─────────────────────────────────────────────────────────────────
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
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id)
  }, [targetDate])
  return parts
}

const FLAGS = {
  Japan: '🇯🇵', Australia: '🇦🇺', China: '🇨🇳', Bahrain: '🇧🇭',
  'Saudi Arabia': '🇸🇦', 'United States': '🇺🇸', 'United Arab Emirates': '🇦🇪',
  Brazil: '🇧🇷', Mexico: '🇲🇽', Italy: '🇮🇹', Spain: '🇪🇸',
  Monaco: '🇲🇨', Canada: '🇨🇦', Austria: '🇦🇹', UK: '🇬🇧',
  'United Kingdom': '🇬🇧', Belgium: '🇧🇪', Netherlands: '🇳🇱',
  Hungary: '🇭🇺', Azerbaijan: '🇦🇿', Singapore: '🇸🇬',
  Qatar: '🇶🇦', 'Las Vegas': '🇺🇸', UAE: '🇦🇪', USA: '🇺🇸',
}

const TEAM_COLOURS = {
  'Red Bull': '#3671C6', 'Ferrari': '#E8002D', 'Mercedes': '#27F4D2',
  'McLaren': '#FF8000', 'Aston Martin': '#229971', 'Alpine': '#FF87BC',
  'Williams': '#64C4FF', 'RB': '#6692FF', 'Haas': '#B6BABD', 'Sauber': '#52E252',
}
function getTeamColour(name) {
  return Object.entries(TEAM_COLOURS).find(([k]) =>
    name?.toLowerCase().includes(k.toLowerCase())
  )?.[1] ?? '#555555'
}

// ── Podium card ───────────────────────────────────────────────────────────────
function PodiumCard({ result, pos }) {
  if (!result) return (
    <div className="flex-1 border border-pitwall-border p-4 opacity-20 min-h-[90px]"
      style={{ background: 'var(--pw-surface)' }}>—</div>
  )
  const driver = result.Driver ?? {}
  const team   = result.Constructor?.name ?? ''
  const code   = driver.code ?? driver.driverId ?? '???'
  const colour = getTeamColour(team)
  const time   = result.Time?.time ?? result.status ?? '—'

  return (
    <div
      className="flex-1 border border-pitwall-border p-4 flex flex-col gap-1 relative overflow-hidden"
      style={{
        borderTop: `3px solid ${colour}`,
        background: `linear-gradient(135deg, ${colour}18 0%, ${colour}06 100%)`,
      }}
    >
      {/* position */}
      <div className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--pw-ghost)' }}>P{pos}</div>
      {/* code */}
      <div
        className={`font-display font-bold tracking-wider ${pos === 1 ? 'text-4xl' : 'text-2xl'}`}
        style={{ color: colour }}
      >
        {code}
      </div>
      {/* name */}
      <div className="font-body text-sm" style={{ color: 'var(--pw-dim)' }}>{driver.familyName}</div>
      {/* team */}
      <div className="font-body text-xs" style={{ color: 'var(--pw-ghost)' }}>{team}</div>
      {/* time */}
      <div className="font-mono text-xs mt-1 font-medium" style={{ color: 'var(--pw-text)' }}>{time}</div>
    </div>
  )
}

// ── Compact race card (right column — clickable) ──────────────────────────────
function RaceCard({ race, onOpen }) {
  const cd  = circuits.find((c) =>
    c.name?.toLowerCase().includes(race.raceName?.toLowerCase().replace(' grand prix', '').trim()) ||
    race.raceName?.toLowerCase().includes(c.name?.toLowerCase().replace(' grand prix', '').trim())
  )
  const flag   = FLAGS[race.Circuit?.Location?.country] ?? '🏁'
  const isPast = new Date(race.date) < new Date()

  return (
    <button
      onClick={() => !isPast && onOpen(race, cd ?? null)}
      disabled={isPast}
      className={`w-full text-left border border-pitwall-border p-3 flex items-center gap-3 transition-all ${
        isPast ? 'opacity-30 cursor-default' : 'hover:border-status-red/50 cursor-pointer group'
      }`}
      style={{ background: 'var(--pw-surface)' }}
    >
      <span className="text-lg flex-shrink-0">{flag}</span>
      <div className="flex-1 min-w-0">
        <div className="font-display font-semibold text-sm tracking-wide leading-tight truncate"
          style={{ color: 'var(--pw-text-strong)' }}>
          {race.raceName?.replace(' Grand Prix', '')}
        </div>
        <div className="font-mono text-[10px]" style={{ color: 'var(--pw-ghost)' }}>
          R{race.round} · {race.date}
        </div>
      </div>
      {cd?.sprint && (
        <span className="font-mono text-[9px] text-status-yellow border border-status-yellow/40 px-1 flex-shrink-0">S</span>
      )}
      {!isPast && (
        <span className="font-mono text-xs flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: 'var(--pw-red)' }}>›</span>
      )}
    </button>
  )
}

// ── Weekend schedule strip ────────────────────────────────────────────────────
function WeekendSchedule({ weekendSessions }) {
  if (!weekendSessions?.length) return null
  return (
    <div className="space-y-px">
      {weekendSessions.map((s) => (
        <div
          key={s.key}
          className={`flex items-center gap-3 py-1.5 px-3 border-b border-pitwall-border ${
            s.live ? 'bg-status-green/10' : ''
          }`}
        >
          <span className="font-mono text-[10px] w-3"
            style={{ color: s.done ? 'var(--pw-ghost)' : s.live ? '#00A651' : 'var(--pw-dim)' }}>
            {s.done ? '✓' : s.live ? '●' : '○'}
          </span>
          <span className={`font-mono text-xs flex-1 ${s.live ? 'font-bold' : ''}`}
            style={{ color: s.done ? 'var(--pw-ghost)' : s.live ? '#00A651' : 'var(--pw-text)' }}>
            {s.label}
          </span>
          <span className="font-mono text-[10px]" style={{ color: 'var(--pw-ghost)' }}>
            {s.dt?.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Countdown block ───────────────────────────────────────────────────────────
function CountdownBlock({ countdown, label }) {
  if (!countdown) return null
  const units = [
    { val: countdown.d,                           lbl: 'days' },
    { val: String(countdown.h).padStart(2, '0'), lbl: 'hrs'  },
    { val: String(countdown.m).padStart(2, '0'), lbl: 'min'  },
    { val: String(countdown.s).padStart(2, '0'), lbl: 'sec'  },
  ]
  return (
    <div>
      {label && (
        <div className="font-mono text-[10px] tracking-widest uppercase mb-3 text-center"
          style={{ color: 'var(--pw-ghost)' }}>
          {label}
        </div>
      )}
      <div className="flex items-end gap-3 justify-center">
        {units.map(({ val, lbl }) => (
          <div key={lbl} className="flex flex-col items-center">
            <span className="countdown-unit" style={{ color: 'var(--pw-text-strong)' }}>{val}</span>
            <span className="countdown-label">{lbl}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Home ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const navigate        = useNavigate()
  const calendar        = useF1Store((s) => s.calendar)
  const calendarLoading = useF1Store((s) => s.calendarLoading)
  const standings       = useF1Store((s) => s.standings)
  const results         = useF1Store((s) => s.results)

  const weekendState = useRaceWeekendState()
  const { mode, currentRace, nextSession, weekendSessions, circuitData, lastSession } = weekendState

  const isWeekend       = ['WEEKEND_BETWEEN_SESSIONS', 'WEEKEND_SESSION_SOON', 'WEEKEND_UPCOMING'].includes(mode)
  const isActiveWeekend = ['WEEKEND_BETWEEN_SESSIONS', 'WEEKEND_SESSION_SOON'].includes(mode)

  const now         = new Date()
  const pastRaces   = calendar.filter((r) => new Date(r.date) < now)
  const futureRaces = calendar.filter((r) => new Date(r.date) >= now)
  const nextRace    = currentRace ?? futureRaces[0] ?? null

  const countdownTarget = nextSession?.targetDt ?? (nextRace ? new Date(`${nextRace.date}T${nextRace.time ?? '13:00:00Z'}`) : null)
  const countdown       = useCountdown(countdownTarget)

  const lastRound  = pastRaces[pastRaces.length - 1]
  const lastResult = lastRound ? results[lastRound.round] : null
  const podium     = lastResult && !lastResult.empty ? (lastResult.Results ?? []).slice(0, 3) : null

  const p1Driver = standings.drivers[0] ?? null
  const p2Driver = standings.drivers[1] ?? null
  const maxPts   = parseFloat(p1Driver?.points ?? 0)

  const heroFlag = FLAGS[nextRace?.Circuit?.Location?.country ?? ''] ?? '🏁'

  const [modalRace,    setModalRace]    = useState(null)
  const [modalCircuit, setModalCircuit] = useState(null)
  const openModal  = (r, c) => { setModalRace(r); setModalCircuit(c) }
  const closeModal = ()     => { setModalRace(null); setModalCircuit(null) }

  return (
    <div className="min-h-full" style={{ background: 'var(--pw-bg)' }}>

      {/* ══════════════════════════════════════════════════════
          HERO — 3 column: [left info 2/3] [right map 1/3]
      ══════════════════════════════════════════════════════ */}
      <section className="border-b border-pitwall-border">
        {calendarLoading ? (
          <div className="flex items-center justify-center h-48 font-mono text-sm"
            style={{ color: 'var(--pw-ghost)' }}>
            Loading season data…
          </div>
        ) : nextRace ? (
          <div className="flex min-h-[280px]">

            {/* ── Left 2/3 — Race info + countdown ──────────────────── */}
            <div className="flex-[2] flex flex-col justify-center px-8 py-8 border-r border-pitwall-border">

              {/* Status badge (active weekend) */}
              {isActiveWeekend && (
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2 h-2 rounded-full bg-status-red animate-pulse" />
                  <span className="font-mono text-[10px] text-status-red tracking-widest uppercase border border-status-red/30 px-2 py-0.5">
                    Race Weekend In Progress
                  </span>
                  <span className="font-mono text-[10px] tracking-widest uppercase border border-pitwall-border px-2 py-0.5"
                    style={{ color: 'var(--pw-ghost)' }}>
                    Round {nextRace.round}
                  </span>
                </div>
              )}

              {/* Race name — centered in its column */}
              <div className="mb-1">
                <div className="font-mono text-[10px] tracking-widest uppercase mb-2"
                  style={{ color: 'var(--pw-ghost)' }}>
                  {mode === 'WEEKEND_UPCOMING' ? 'Race Weekend Starting Soon' : isActiveWeekend ? 'This Weekend' : 'Next Race'} · Round {nextRace.round}
                </div>
                <h1 className="font-display font-bold text-5xl tracking-wide uppercase leading-none"
                  style={{ color: 'var(--pw-text-strong)' }}>
                  {heroFlag} {nextRace.raceName}
                </h1>
                <div className="font-display text-base tracking-widest uppercase mt-2"
                  style={{ color: 'var(--pw-dim)' }}>
                  {nextRace.Circuit?.Location?.country ?? ''} · {nextRace.Circuit?.circuitName ?? ''}
                </div>
                <div className="font-mono text-xs mt-1" style={{ color: 'var(--pw-ghost)' }}>
                  Race: {nextRace.date}
                </div>
              </div>

              {/* Last session tag (active weekend) */}
              {lastSession && (
                <div className="mt-3">
                  <span className="font-mono text-[10px] text-status-green border border-status-green/30 px-2 py-0.5">
                    ✓ {lastSession.label} COMPLETE
                  </span>
                </div>
              )}

              {/* Countdown */}
              <div className="mt-6">
                {nextSession && countdown && (
                  <div>
                    <div className="font-mono text-[10px] tracking-widest uppercase mb-3"
                      style={{ color: 'var(--pw-ghost)' }}>
                      {isActiveWeekend ? `Next — ${nextSession.label}` : `${nextSession.label} in`}
                    </div>
                    <CountdownBlock countdown={countdown} />
                  </div>
                )}
                {!nextSession && countdown && <CountdownBlock countdown={countdown} label="Race in" />}
                {nextSession && !countdown && (
                  <div className="font-display text-sm tracking-widest uppercase animate-pulse text-status-red">
                    {nextSession.label} Starting Now
                  </div>
                )}
              </div>

              {/* CTA buttons */}
              <div className="flex items-center gap-3 mt-6">
                {isActiveWeekend && (
                  <Link to="/live"
                    className="font-mono text-xs tracking-widest uppercase px-4 py-2 border border-status-red/50 text-status-red hover:bg-status-red hover:text-white transition-colors">
                    Open Live Timing →
                  </Link>
                )}
                <button
                  onClick={() => openModal(nextRace, circuitData)}
                  className="font-mono text-xs tracking-widest uppercase px-4 py-2 border border-pitwall-border hover:border-pitwall-muted transition-colors"
                  style={{ color: 'var(--pw-dim)' }}>
                  Full Weekend Details →
                </button>
              </div>
            </div>

            {/* ── Right 1/3 — Track map + stats ─────────────────────── */}
            <div className="flex-1 flex flex-col p-6 gap-0 justify-center" style={{ minWidth: 260, maxWidth: 380 }}>
              {circuitData ? (
                <TrackMap circuitData={circuitData} compact showStats />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <span className="font-mono text-sm" style={{ color: 'var(--pw-ghost)' }}>
                    No circuit data
                  </span>
                </div>
              )}
            </div>
          </div>

        ) : (
          <div className="flex items-center justify-center h-48">
            <div>
              <h1 className="font-display font-bold text-5xl tracking-wide uppercase text-center"
                style={{ color: 'var(--pw-text-strong)' }}>
                2026 F1 World Championship
              </h1>
              <div className="font-mono text-sm text-center mt-2" style={{ color: 'var(--pw-dim)' }}>
                Season complete
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════
          LOWER BODY — 3 columns: [standings] [podium] [upcoming]
      ══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-3 divide-x divide-pitwall-border">

        {/* ── Col 1: Championship standings (clickable) ─────── */}
        <div className="flex flex-col">

          {/* Weekend schedule strip (if active weekend) */}
          {isWeekend && weekendSessions.length > 0 && (
            <section className="border-b border-pitwall-border">
              <div className="px-5 pt-4 pb-2 font-mono text-[10px] tracking-widest uppercase"
                style={{ color: 'var(--pw-ghost)' }}>
                Weekend Schedule
              </div>
              <WeekendSchedule weekendSessions={weekendSessions} />
            </section>
          )}

          {/* Championship leader — navigates to /standings */}
          {standings.drivers.length > 0 && (
            <section className="flex-1">
              <button
                onClick={() => navigate('/standings')}
                className="w-full text-left p-5 group transition-colors hover:bg-pitwall-surface/40"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-[10px] tracking-widest uppercase"
                    style={{ color: 'var(--pw-ghost)' }}>
                    Drivers Championship
                  </span>
                  <span className="font-mono text-[10px] tracking-widest transition-colors"
                    style={{ color: 'var(--pw-ghost)' }}
                    onMouseEnter={(e) => e.target.style.color = 'var(--pw-red)'}
                    onMouseLeave={(e) => e.target.style.color = 'var(--pw-ghost)'}>
                    VIEW ALL →
                  </span>
                </div>

                {/* P1 driver */}
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-display font-bold text-4xl"
                    style={{ color: getTeamColour(p1Driver?.Constructors?.[0]?.name ?? '') }}>
                    {p1Driver?.Driver?.code ?? '—'}
                  </span>
                  <span className="font-body text-base" style={{ color: 'var(--pw-dim)' }}>
                    {p1Driver?.Driver?.familyName}
                  </span>
                  <span className="font-mono text-xl ml-auto font-bold"
                    style={{ color: 'var(--pw-text-strong)' }}>
                    {p1Driver?.points}
                    <span className="text-xs ml-1" style={{ color: 'var(--pw-ghost)' }}>pts</span>
                  </span>
                </div>

                {/* Points bar */}
                <div className="w-full h-0.5 mb-3" style={{ background: 'var(--pw-border)' }}>
                  <div className="h-full" style={{
                    width: '100%',
                    background: getTeamColour(p1Driver?.Constructors?.[0]?.name ?? ''),
                    transition: 'width 0.6s ease',
                  }} />
                </div>

                {/* P2 gap */}
                {p2Driver && (
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs" style={{ color: 'var(--pw-dim)' }}>
                      P2: <span style={{ color: 'var(--pw-text)' }}>{p2Driver?.Driver?.code}</span>
                    </span>
                    <span className="font-mono text-xs" style={{ color: 'var(--pw-dim)' }}>
                      {p2Driver?.points} pts
                      <span className="ml-1" style={{ color: 'var(--pw-ghost)' }}>
                        (−{(maxPts - parseFloat(p2Driver?.points ?? 0)).toFixed(0)})
                      </span>
                    </span>
                  </div>
                )}

                {/* Top 5 mini list */}
                <div className="mt-4 space-y-1.5">
                  {standings.drivers.slice(0, 5).map((entry, i) => {
                    const pts  = parseFloat(entry.points ?? 0)
                    const pct  = maxPts > 0 ? (pts / maxPts) * 100 : 0
                    const col  = getTeamColour(entry.Constructors?.[0]?.name ?? '')
                    return (
                      <div key={entry.Driver?.driverId ?? i} className="flex items-center gap-2">
                        <span className="font-mono text-[10px] w-4 text-right flex-shrink-0"
                          style={{ color: 'var(--pw-ghost)' }}>{i + 1}</span>
                        <div className="w-0.5 h-3 rounded flex-shrink-0" style={{ background: col }} />
                        <span className="font-mono text-xs w-10 flex-shrink-0"
                          style={{ color: 'var(--pw-text)' }}>{entry.Driver?.code}</span>
                        <div className="flex-1 h-px" style={{ background: 'var(--pw-border)' }}>
                          <div className="h-full" style={{ width: `${pct}%`, background: col, opacity: 0.7 }} />
                        </div>
                        <span className="font-mono text-[10px] w-8 text-right flex-shrink-0"
                          style={{ color: 'var(--pw-dim)' }}>{entry.points}</span>
                      </div>
                    )
                  })}
                </div>
              </button>
            </section>
          )}
        </div>

        {/* ── Col 2: Last race podium ────────────────────────── */}
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-[10px] tracking-widest uppercase"
              style={{ color: 'var(--pw-ghost)' }}>
              Last Race{lastRound ? ` — ${lastRound.raceName?.replace(' Grand Prix', '')} GP` : ''}
            </span>
            <Link to="/results"
              className="font-mono text-[10px] tracking-widest transition-colors"
              style={{ color: 'var(--pw-ghost)' }}
              onMouseEnter={(e) => e.target.style.color = 'var(--pw-red)'}
              onMouseLeave={(e) => e.target.style.color = 'var(--pw-ghost)'}>
              RESULTS →
            </Link>
          </div>

          {podium ? (
            <div className="flex gap-2 items-end">
              <PodiumCard result={podium[1]} pos={2} />
              <PodiumCard result={podium[0]} pos={1} />
              <PodiumCard result={podium[2]} pos={3} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 font-mono text-sm"
              style={{ color: 'var(--pw-ghost)' }}>
              {pastRaces.length === 0 ? 'Season not started' : 'Select Results → load race'}
            </div>
          )}
        </div>

        {/* ── Col 3: Upcoming races (clickable) ─────────────── */}
        <div className="p-5">
          <div className="font-mono text-[10px] tracking-widest uppercase mb-4"
            style={{ color: 'var(--pw-ghost)' }}>
            Upcoming Races
          </div>
          {futureRaces.length === 0 ? (
            <div className="font-mono text-sm" style={{ color: 'var(--pw-dim)' }}>Season complete</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {futureRaces.slice(0, 7).map((race) => {
                const cd = circuits.find((c) =>
                  c.name?.toLowerCase().includes(race.raceName?.toLowerCase().replace(' grand prix', '').trim()) ||
                  race.raceName?.toLowerCase().includes(c.name?.toLowerCase().replace(' grand prix', '').trim())
                )
                return <RaceCard key={race.round} race={race} onOpen={(r, c) => openModal(r, c ?? cd)} />
              })}
            </div>
          )}
        </div>
      </div>

      {/* Race detail modal */}
      {modalRace && (
        <RaceModal race={modalRace} circuitData={modalCircuit} onClose={closeModal} />
      )}
    </div>
  )
}
