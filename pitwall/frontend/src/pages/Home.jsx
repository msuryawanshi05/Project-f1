import { useEffect, useState } from 'react'
import useF1Store from '../store/useF1Store'
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

// ── Podium card ───────────────────────────────────────────────────────────────
function PodiumCard({ result, pos }) {
  if (!result) return <div className="flex-1 bg-[#111] border border-pitwall-border p-4 opacity-30">—</div>

  const driver     = result.Driver ?? {}
  const team       = result.Constructor?.name ?? ''
  const code       = driver.code ?? driver.driverId ?? '???'
  const familyName = driver.familyName ?? ''
  const time       = result.Time?.time ?? result.status ?? '—'

  // Map constructor to team colour
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
      <div className="font-display text-pitwall-ghost text-xs tracking-widest">
        P{pos}
      </div>
      <div className={`font-display font-bold tracking-wider text-white ${isWinner ? 'text-4xl' : 'text-2xl'}`}>
        {code}
      </div>
      <div className="font-body text-sm text-pitwall-dim">{familyName}</div>
      <div className="font-mono text-xs text-pitwall-ghost mt-1">{time}</div>
      <div className="font-body text-xs text-pitwall-ghost">{team}</div>
    </div>
  )
}

// ── Compact race card ─────────────────────────────────────────────────────────
function RaceCard({ race }) {
  const circuitData = circuits.find((c) =>
    c.name?.toLowerCase().includes(race.raceName?.toLowerCase().replace(' grand prix', '').trim()) ||
    race.raceName?.toLowerCase().includes(c.name?.toLowerCase().replace(' grand prix', '').trim())
  )
  const countryFlag = race.Circuit?.Location?.country ?? ''

  // Simple flag by country name
  const FLAGS = {
    Japan: '🇯🇵', Australia: '🇦🇺', China: '🇨🇳', Bahrain: '🇧🇭',
    'Saudi Arabia': '🇸🇦', 'United States': '🇺🇸', 'United Arab Emirates': '🇦🇪',
    Brazil: '🇧🇷', Mexico: '🇲🇽', Italy: '🇮🇹', Spain: '🇪🇸',
    Monaco: '🇲🇨', Canada: '🇨🇦', Austria: '🇦🇹', UK: '🇬🇧',
    'United Kingdom': '🇬🇧', Belgium: '🇧🇪', Netherlands: '🇳🇱',
    Hungary: '🇭🇺', Azerbaijan: '🇦🇿', Singapore: '🇸🇬',
    Qatar: '🇶🇦', 'Las Vegas': '🇺🇸',
  }
  const flag = FLAGS[countryFlag] ?? '🏁'

  return (
    <div className="flex-1 min-w-0 bg-pitwall-surface border border-pitwall-border p-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="font-display text-xs text-pitwall-ghost tracking-widest">R{race.round}</span>
        {circuitData?.sprint && (
          <span className="font-mono text-[9px] text-status-yellow border border-status-yellow/40 px-1">S</span>
        )}
      </div>
      <div className="text-lg">{flag}</div>
      <div className="font-display font-semibold text-sm text-pitwall-text tracking-wide leading-tight">
        {race.raceName?.replace(' Grand Prix', '')}
      </div>
      <div className="font-mono text-xs text-pitwall-dim">{race.date}</div>
    </div>
  )
}

// ── Home page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const calendar        = useF1Store((s) => s.calendar)
  const calendarLoading = useF1Store((s) => s.calendarLoading)
  const standings       = useF1Store((s) => s.standings)
  const results         = useF1Store((s) => s.results)

  const now      = new Date()
  const pastRaces = calendar.filter((r) => new Date(r.date) < now)
  const futureRaces = calendar.filter((r) => new Date(r.date) >= now)
  const nextRace  = futureRaces[0] ?? null
  const countdown = useCountdown(nextRace?.date)

  // Get last completed round's results if available
  const lastRound = pastRaces[pastRaces.length - 1]
  const lastResult = lastRound ? results[lastRound.round] : null
  const podium = lastResult && !lastResult.empty
    ? (lastResult.Results ?? []).slice(0, 3)
    : null

  const p1Driver = standings.drivers[0] ?? null
  const p2Driver = standings.drivers[1] ?? null

  return (
    <div className="min-h-full bg-pitwall-bg">

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="border-b border-pitwall-border px-8 py-10">
        {calendarLoading ? (
          <div className="font-mono text-pitwall-dim text-sm">Loading season data…</div>
        ) : nextRace ? (
          <div className="flex items-start justify-between gap-8">
            {/* Left — race name */}
            <div className="flex flex-col gap-2">
              <div className="font-mono text-pitwall-ghost text-xs tracking-widest uppercase">
                Next Race · Round {nextRace.round}
              </div>
              <h1 className="font-display font-bold text-5xl text-white tracking-wide uppercase leading-none">
                {nextRace.raceName}
              </h1>
              <div className="font-display text-pitwall-dim text-lg tracking-widest uppercase">
                {nextRace.Circuit?.Location?.country ?? ''} · {nextRace.Circuit?.circuitName ?? ''}
              </div>
              <div className="font-mono text-sm text-pitwall-dim mt-1">
                Race: {nextRace.date}
              </div>
            </div>

            {/* Right — countdown */}
            {countdown && (
              <div className="flex-shrink-0 flex flex-col items-end gap-3">
                <div className="font-mono text-pitwall-ghost text-xs tracking-widest uppercase">
                  Countdown
                </div>
                <div className="flex items-end gap-3">
                  {[
                    { val: countdown.d, label: 'days' },
                    { val: String(countdown.h).padStart(2,'0'), label: 'hrs' },
                    { val: String(countdown.m).padStart(2,'0'), label: 'min' },
                    { val: String(countdown.s).padStart(2,'0'), label: 'sec' },
                  ].map(({ val, label }) => (
                    <div key={label} className="flex flex-col items-center">
                      <span className="countdown-unit">{val}</span>
                      <span className="countdown-label">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <h1 className="font-display font-bold text-5xl text-white tracking-wide uppercase">
              2026 F1 World Championship
            </h1>
            <div className="font-mono text-pitwall-dim text-sm mt-2">
              No upcoming races found
            </div>
          </div>
        )}
      </section>

      <div className="flex gap-px">

        {/* ── Left column ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 border-r border-pitwall-border">

          {/* Championship leader */}
          {standings.drivers.length > 0 && (
            <section className="p-6 border-b border-pitwall-border">
              <div className="font-mono text-pitwall-ghost text-xs tracking-widest uppercase mb-4">
                Drivers Championship
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
            </section>
          )}

          {/* Last race podium */}
          {podium ? (
            <section className="p-6 border-b border-pitwall-border">
              <div className="font-mono text-pitwall-ghost text-xs tracking-widest uppercase mb-4">
                Last Race — {lastRound?.raceName}
              </div>
              <div className="flex gap-2 items-end">
                <PodiumCard result={podium[1]} pos={2} />
                <PodiumCard result={podium[0]} pos={1} />
                <PodiumCard result={podium[2]} pos={3} />
              </div>
            </section>
          ) : (
            <section className="p-6 border-b border-pitwall-border">
              <div className="font-mono text-pitwall-ghost text-xs tracking-widest uppercase mb-2">
                Last Race
              </div>
              <div className="font-body text-pitwall-dim text-sm">
                {pastRaces.length === 0 ? 'Season not yet started' : 'Click Results to load race data'}
              </div>
            </section>
          )}
        </div>

        {/* ── Right column — upcoming races ───────────────────────── */}
        <div className="w-80 flex-shrink-0 p-6">
          <div className="font-mono text-pitwall-ghost text-xs tracking-widest uppercase mb-4">
            Upcoming Races
          </div>
          {futureRaces.length === 0 ? (
            <div className="font-body text-pitwall-dim text-sm">Season complete</div>
          ) : (
            <div className="flex flex-col gap-2">
              {futureRaces.slice(0, 5).map((race) => (
                <RaceCard key={race.round} race={race} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
