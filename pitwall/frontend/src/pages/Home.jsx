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
import { getCountryAbbreviation, formatCountdown, getSafeTeamColour } from '../utils/driverUtils'
import { useTilt } from '../hooks/useTilt'
import { AnimatedNumber } from '../components/ui/AnimatedNumber'
import { PageReveal, RevealItem } from '../components/layout/PageReveal'
import { motion } from 'framer-motion'

// ── Countdown ─────────────────────────────────────────────────────────────────
function useCountdownSeconds(targetDate) {
  const [seconds, setSeconds] = useState(null)
  useEffect(() => {
    if (!targetDate) return
    const tick = () => {
      const ms = new Date(targetDate) - new Date()
      if (ms <= 0) { setSeconds(null); return }
      setSeconds(Math.floor(ms / 1000))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetDate])
  return seconds
}

const TEAM_COLOURS = {
  'Red Bull': '#3671C6', 'Ferrari': '#E8002D', 'Mercedes': '#27F4D2',
  'McLaren': '#FF8000', 'Aston Martin': '#229971', 'Alpine': '#FF87BC',
  'Williams': '#64C4FF', 'RB': '#6692FF', 'Haas': '#B6BABD', 'Sauber': '#52E252',
  'Audi': '#A6A6A6', 'Cadillac': '#EEB211',
}
function getTeamColour(name) {
  const hex = Object.entries(TEAM_COLOURS).find(([k]) =>
    name?.toLowerCase().includes(k.toLowerCase())
  )?.[1] ?? '#555555'
  return getSafeTeamColour(hex)
}

// ── Podium card ───────────────────────────────────────────────────────────────
function PodiumCard({ result, pos }) {
  if (!result) return (
    <div className="flex-1 border border-white/5 p-4 opacity-20 min-h-[110px] flex items-center justify-center bg-white/2 rounded-sm"
      style={{ borderStyle: 'dashed' }}>
      <span className="font-mono text-xs text-pitwall-ghost">P{pos}</span>
    </div>
  )
  const driver = result.Driver ?? {}
  const team   = result.Constructor?.name ?? ''
  const code   = driver.code ?? driver.driverId ?? '???'
  const colour = getTeamColour(team)
  const time   = result.Time?.time ?? result.status ?? '—'
  const isP1   = pos === 1
  const isP2   = pos === 2

  // Stepped heights: P1 (center) = tallest, P2 = middle, P3 = shortest
  const heightCls = isP1 ? 'min-h-[165px]' : isP2 ? 'min-h-[150px]' : 'min-h-[135px]'

  const { ref, rotateX, rotateY, onMouseMove, onMouseLeave } = useTilt(6)

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{
        borderTop: `3.5px solid ${colour}`,
        background: `linear-gradient(180deg, var(--pw-surface) 0%, ${colour}15 100%)`,
        boxShadow: `0 8px 30px ${colour}10`,
        rotateX,
        rotateY,
        transformPerspective: 800,
      }}
      whileHover={{ scale: 1.02 }}
      className={`flex-1 flex flex-col justify-end p-4 border border-pitwall-border relative overflow-hidden ${heightCls} rounded-sm glow-card`}
    >
      {/* P1 Shine sweep */}
      {isP1 && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.15) 50%, transparent 70%)' }}
          initial={{ x: '-100%' }}
          animate={{ x: '200%' }}
          transition={{ duration: 1.4, delay: 0.3, ease: 'easeInOut' }}
        />
      )}

      {/* Ambient glow in background */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-10 opacity-30 pointer-events-none blur-md"
        style={{ background: colour }}
      />
      
      {/* Stepped overlay P1/P2/P3 indicator */}
      <div 
        className="absolute top-2 right-2 font-display text-[28px] font-extrabold italic opacity-15 leading-none select-none"
        style={{ color: colour }}
      >
        P{pos}
      </div>

      {/* Code */}
      <div
        className="font-display font-black tracking-wider leading-snug text-2xl"
        style={{ color: colour }}
      >
        {code}
      </div>

      {/* Full family name */}
      <div className="font-body text-xs font-semibold mt-1 truncate text-pitwall-text leading-snug">
        {driver.familyName?.toUpperCase()}
      </div>

      {/* Constructor */}
      <div className="flex items-center gap-1.5 mt-1.5">
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: colour }} />
        <span className="font-display text-[10px] tracking-widest font-bold truncate uppercase text-pitwall-text leading-none">
          {team}
        </span>
      </div>

      {/* Time */}
      <div className="font-mono text-[9px] mt-2 pt-1.5 border-t border-pitwall-border flex justify-between" style={{ color: 'var(--pw-text-strong)' }}>
        <span className="text-pitwall-dim">LAP TIME:</span>
        <span className="font-bold">{time}</span>
      </div>
    </motion.div>
  )
}

// ── Compact race card (right column — clickable) ──────────────────────────────
function RaceCard({ race, onOpen }) {
  const cd  = circuits.find((c) =>
    c.name?.toLowerCase().includes(race.raceName?.toLowerCase().replace(' grand prix', '').trim()) ||
    race.raceName?.toLowerCase().includes(c.name?.toLowerCase().replace(' grand prix', '').trim())
  )
  const flag   = getCountryAbbreviation(race.Circuit?.Location?.country)
  const isPast = new Date(race.date) < new Date()

  const { ref, rotateX, rotateY, onMouseMove, onMouseLeave } = useTilt(5)

  return (
    <motion.button
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onClick={() => !isPast && onOpen(race, cd ?? null)}
      disabled={isPast}
      whileHover={isPast ? {} : { scale: 1.02 }}
      whileTap={isPast ? {} : { scale: 0.98 }}
      className={`w-full text-left border border-pitwall-border p-3 flex items-center gap-3 transition-all ${
        isPast ? 'opacity-50 cursor-default' : 'hover:border-status-red/70 hover:bg-pitwall-surface-2 cursor-pointer group'
      }`}
      style={{
        background: 'var(--pw-surface)',
        rotateX,
        rotateY,
        transformPerspective: 600,
      }}
    >
      <div className="flex-shrink-0 font-mono font-bold text-xs bg-pitwall-surface-2 border border-pitwall-border px-1.5 py-0.5 rounded-sm text-pitwall-text-strong w-10 text-center">
        {flag}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display font-semibold text-sm tracking-wide leading-tight truncate text-pitwall-text-strong">
          {race.raceName?.replace(' Grand Prix', '')}
        </div>
        <div className="font-mono text-[10px] text-pitwall-dim">
          R{race.round} · {race.date}
        </div>
      </div>
      {cd?.sprint && (
        <span className="font-mono text-[9px] text-status-yellow border border-status-yellow/40 px-1 flex-shrink-0">S</span>
      )}
      {!isPast && (
        <span className="font-mono text-xs flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-status-red">›</span>
      )}
    </motion.button>
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
            style={{ color: s.done ? 'var(--pw-dim)' : s.live ? '#00A651' : 'var(--pw-text)' }}>
            {s.label}
          </span>
          <span className="font-mono text-[10px]" style={{ color: 'var(--pw-dim)' }}>
            {s.dt?.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
          </span>
        </div>
      ))}
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
  const countdownSeconds = useCountdownSeconds(countdownTarget)

  const lastRound  = pastRaces[pastRaces.length - 1]
  const lastResult = lastRound ? results[lastRound.round] : null
  const podium     = lastResult && !lastResult.empty ? (lastResult.Results ?? []).slice(0, 3) : null

  const p1Driver = standings.drivers[0] ?? null
  const p2Driver = standings.drivers[1] ?? null
  const maxPts   = parseFloat(p1Driver?.points ?? 0)

  const heroFlag = getCountryAbbreviation(nextRace?.Circuit?.Location?.country)

  const [modalRace,    setModalRace]    = useState(null)
  const [modalCircuit, setModalCircuit] = useState(null)
  const openModal  = (r, c) => { setModalRace(r); setModalCircuit(c) }
  const closeModal = ()     => { setModalRace(null); setModalCircuit(null) }

  return (
    <div className="min-h-full" style={{ background: 'var(--pw-bg)' }}>

      {/* ══════════════════════════════════════════════════════
          HERO — 3 column: [left info 2/3] [right map 1/3]
          ══════════════════════════════════════════════════════ */}
      <section className="border-b border-pitwall-border bg-carbon bg-grid-pattern relative overflow-hidden">
        {/* Ambient glow backdrop */}
        <div className="ambient-glow" />
        {/* Subtle grid red laser glow stripe */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E10600]/40 to-transparent" />
        
        {calendarLoading ? (
          <div className="flex items-center justify-center h-48 font-mono text-sm"
            style={{ color: 'var(--pw-ghost)' }}>
            Loading season data…
          </div>
        ) : nextRace ? (
          <PageReveal className="flex min-h-[300px] relative z-10">

            {/* ── Left 2/3 — Race info + countdown ──────────────────── */}
            <RevealItem className="flex-[2] flex flex-col justify-center px-8 py-8 border-r border-pitwall-border backdrop-blur-[2px]">

              {/* Status badge (active weekend) */}
              {isActiveWeekend && (
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2.5 h-2.5 rounded-full bg-status-red led-dot red" />
                  <span className="font-mono text-[10px] text-status-red tracking-widest uppercase border border-status-red/30 px-2.5 py-0.5 bg-[#E10600]/10 rounded-sm">
                    Race Weekend In Progress
                  </span>
                  <span className="font-mono text-[10px] tracking-widest uppercase border border-white/10 bg-white/5 px-2.5 py-0.5 rounded-sm"
                    style={{ color: 'var(--pw-dim)' }}>
                    Round {nextRace.round}
                  </span>
                </div>
              )}

              {/* Race name — centered in its column */}
              <div className="mb-1">
                <div className="font-display text-[11px] tracking-widest uppercase mb-1.5 font-bold text-status-red">
                  {mode === 'WEEKEND_UPCOMING' ? 'RACE WEEKEND STARTING SOON' : isActiveWeekend ? 'THIS WEEKEND' : 'NEXT RACE'} · ROUND {nextRace.round}
                </div>
                <h1 className="font-display font-extrabold text-5xl tracking-wide uppercase leading-none text-pitwall-text-strong flex items-center">
                  <span className="inline-block font-mono font-bold text-2.5xl bg-status-red px-3.5 py-1 skew-x-[-12deg] text-white mr-4 align-middle shadow-md border-r-2 border-r-white/20 select-none">
                    <span className="inline-block skew-x-[12deg]">{heroFlag}</span>
                  </span>
                  <span className="align-middle">{nextRace.raceName}</span>
                </h1>
                <div className="font-display text-base tracking-widest font-semibold uppercase mt-2 text-pitwall-dim">
                  {nextRace.Circuit?.Location?.country ?? ''} · {nextRace.Circuit?.circuitName ?? ''}
                </div>
                <div className="font-mono text-xs mt-1.5 text-pitwall-dim font-medium">
                  RACE START: {nextRace.date}
                </div>
              </div>

              {/* Last session tag (active weekend) */}
              {lastSession && (
                <div className="mt-3">
                  <span className="font-mono text-[10px] text-status-green border border-status-green/30 bg-[#00D2BE]/10 px-2 py-0.5 rounded-sm font-semibold">
                    ✓ {lastSession.label?.toUpperCase()} COMPLETE
                  </span>
                </div>
              )}

              {/* Countdown */}
              <div className="mt-6">
                {nextSession && countdownSeconds !== null && (
                  <div>
                    <div className="font-mono text-[10px] tracking-widest uppercase mb-3 text-pitwall-dim">
                      {isActiveWeekend ? `NEXT SESSION: ${nextSession.label?.toUpperCase()}` : `${nextSession.label?.toUpperCase()} COUNTDOWN`}
                    </div>
                    <div className="font-mono text-3xl font-black text-pitwall-text-strong tracking-wider bg-white/5 border border-white/10 px-4 py-2.5 rounded-sm inline-block shadow-inner backdrop-blur-md">
                      {formatCountdown(countdownSeconds)}
                    </div>
                  </div>
                )}
                {!nextSession && countdownSeconds !== null && (
                  <div>
                    <div className="font-mono text-[10px] tracking-widest uppercase mb-3 text-pitwall-dim">
                      RACE COUNTDOWN
                    </div>
                    <div className="font-mono text-3xl font-black text-pitwall-text-strong tracking-wider bg-white/5 border border-white/10 px-4 py-2.5 rounded-sm inline-block shadow-inner backdrop-blur-md">
                      {formatCountdown(countdownSeconds)}
                    </div>
                  </div>
                )}
                {nextSession && countdownSeconds === null && (
                  <div className="font-display text-sm tracking-widest uppercase animate-pulse text-status-red font-black">
                    {nextSession.label} STARTING NOW
                  </div>
                )}
              </div>

              {/* CTA buttons */}
              <div className="flex items-center gap-3 mt-6">
                {isActiveWeekend && (
                  <Link to="/live"
                    className="font-display font-bold text-xs tracking-widest uppercase px-5 py-2.5 bg-status-red text-white hover:brightness-110 active:scale-[0.97] transition-all rounded-sm shadow-lg shadow-status-red/20 flex-shrink-0">
                    OPEN LIVE TIMING →
                  </Link>
                )}
                <button
                  onClick={() => openModal(nextRace, circuitData)}
                  className="font-display font-bold text-xs tracking-widest uppercase px-5 py-2.5 border border-pitwall-border hover:border-pitwall-ghost bg-pitwall-surface hover:bg-pitwall-surface-2 text-pitwall-text-strong active:scale-[0.97] transition-all rounded-sm flex-shrink-0"
                >
                  FULL WEEKEND DETAILS
                </button>
              </div>
            </RevealItem>

            {/* ── Right 1/3 — Track map + stats ─────────────────────── */}
            <RevealItem className="flex-1 flex flex-col p-6 gap-0 justify-center" style={{ minWidth: 260, maxWidth: 380 }}>
              {circuitData ? (
                <TrackMap circuitData={circuitData} compact showStats />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <span className="font-mono text-sm" style={{ color: 'var(--pw-ghost)' }}>
                    No circuit data
                  </span>
                </div>
              )}
            </RevealItem>
          </PageReveal>

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
      <PageReveal className="grid grid-cols-3 divide-x divide-pitwall-border">

        {/* ── Col 1: Championship standings (clickable) ─────── */}
        <RevealItem className="flex flex-col">

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
                  <span className="font-mono text-[10px] tracking-widest uppercase text-pitwall-dim">
                    Drivers Championship
                  </span>
                  <span className="font-mono text-[10px] tracking-widest transition-colors text-pitwall-dim hover:text-status-red">
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
                    <AnimatedNumber value={parseFloat(p1Driver?.points ?? 0)} />
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
                      P2: <span style={{ color: getTeamColour(p2Driver?.Constructors?.[0]?.name ?? '') }}>{p2Driver?.Driver?.code}</span>
                    </span>
                    <span className="font-mono text-xs" style={{ color: 'var(--pw-dim)' }}>
                      <AnimatedNumber value={parseFloat(p2Driver?.points ?? 0)} /> pts
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
                          style={{ color: col }}>{entry.Driver?.code}</span>
                        <div className="flex-1 h-px" style={{ background: 'var(--pw-border)' }}>
                          <div className="h-full" style={{ width: `${pct}%`, background: col, opacity: 0.7 }} />
                        </div>
                        <span className="font-mono text-[10px] w-8 text-right flex-shrink-0"
                          style={{ color: 'var(--pw-dim)' }}><AnimatedNumber value={parseFloat(entry.points ?? 0)} /></span>
                      </div>
                    )
                  })}
                </div>
              </button>
            </section>
          )}
        </RevealItem>

        {/* ── Col 2: Last race podium ────────────────────────── */}
        <RevealItem className="p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-[10px] tracking-widest uppercase text-pitwall-dim">
              Last Race{lastRound ? ` — ${lastRound.raceName?.replace(' Grand Prix', '')} GP` : ''}
            </span>
            <Link to="/results"
              className="font-mono text-[10px] tracking-widest transition-colors text-pitwall-dim hover:text-status-red">
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
        </RevealItem>

        {/* ── Col 3: Upcoming races (clickable) ─────────────── */}
        <RevealItem className="p-5">
          <div className="font-mono text-[10px] tracking-widest uppercase mb-4 text-pitwall-dim">
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
        </RevealItem>
      </PageReveal>

      {/* Race detail modal */}
      {modalRace && (
        <RaceModal race={modalRace} circuitData={modalCircuit} onClose={closeModal} />
      )}
    </div>
  )
}
