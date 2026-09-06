import { useState } from 'react'
import { motion } from 'framer-motion'
import useF1Store from '../store/useF1Store'
import teamsData from '../data/teams.json'
import { getSafeTeamColour } from '../utils/driverUtils'
import { AnimatedNumber } from '../components/ui/AnimatedNumber'

const TEAM_COLOURS = teamsData.teamColours

function getTeamColourByName(teamName) {
  const hex = Object.entries(TEAM_COLOURS).find(([k]) =>
    teamName?.toLowerCase().includes(k.toLowerCase())
  )?.[1] ?? '#444444'
  return getSafeTeamColour(hex)
}

function teamSlug(name) {
  if (!name) return '_fallback'
  const clean = name.toLowerCase()
  if (clean.includes('mercedes')) return 'mercedes'
  if (clean.includes('ferrari')) return 'ferrari'
  if (clean.includes('red bull') || clean.includes('redbull')) return 'red-bull'
  if (clean.includes('mclaren')) return 'mclaren'
  if (clean.includes('aston martin') || clean.includes('astonmartin')) return 'aston-martin'
  if (clean.includes('alpine')) return 'alpine'
  if (clean.includes('williams')) return 'williams'
  if (clean.includes('haas')) return 'haas'
  if (clean.includes('kick sauber') || clean.includes('sauber') || clean.includes('stake')) return 'kick-sauber'
  if (clean.includes('rb') || clean.includes('racing bulls') || clean.includes('cash app')) return 'rb'
  if (clean.includes('audi')) return 'audi'
  if (clean.includes('cadillac')) return 'cadillac'
  return '_fallback'
}

// ── Points bar ─────────────────────────────────────────────────────────────────
function PointsBar({ points, max, colour }) {
  const pct = max > 0 ? Math.round((parseFloat(points) / max) * 100) : 0
  return (
    <div className="w-full h-1.5 mt-1.5 bg-pitwall-surface-2 rounded-sm overflow-hidden border border-pitwall-border/40">
      <div
        className="h-full transition-all duration-1000 rounded-sm"
        style={{ 
          width: `${pct}%`, 
          backgroundColor: colour,
          boxShadow: `0 0 8px ${colour}40`
        }}
      />
    </div>
  )
}

// ── Driver row in standings ───────────────────────────────────────────────────
function DriverStandingRow({ entry, maxPts, isLeader, isFav, teamColour }) {
  const d       = entry.Driver ?? {}
  const code    = d.code ?? d.driverId ?? '???'
  const teamName= entry.Constructors?.[0]?.name ?? '—'
  const pts     = parseFloat(entry.points ?? 0)
  const p1Pts   = maxPts

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-20px' }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={`grid grid-cols-[30px_1fr_60px] sm:grid-cols-[40px_180px_1fr_70px_70px] md:grid-cols-[40px_180px_1fr_140px_70px_70px] items-center gap-3 py-3 border-b border-pitwall-border hover:bg-pitwall-surface/40 transition-colors px-4 ${
        isFav ? 'bg-pitwall-surface/20' : ''
      }`}
      style={isFav ? { boxShadow: `inset 3.5px 0 0 ${teamColour}, 0 0 10px ${teamColour}11` } : {}}
    >
      {/* Pos */}
      <div className={`text-center font-display font-black text-sm italic ${isLeader ? 'text-status-yellow' : 'text-pitwall-dim'}`}>
        {entry.position}
      </div>

      {/* Grouped: Team colour swatch, Code + name */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-[3px] h-6 flex-shrink-0" style={{ backgroundColor: teamColour }} />
        <div className="flex items-baseline gap-1.5 min-w-0 truncate">
          <span className="font-display font-extrabold text-sm tracking-widest" style={{ color: teamColour }}>{code}</span>
          <span className="font-body text-xs truncate" style={{ color: teamColour }}>{d.familyName}</span>
        </div>
      </div>

      {/* Points bar */}
      <div className="hidden sm:block">
        <PointsBar points={pts} max={p1Pts} colour={teamColour} />
      </div>

      {/* Team */}
      <div className="hidden md:block font-display font-bold text-xs text-pitwall-ghost truncate uppercase text-left">
        {teamName}
      </div>

      {/* Wins */}
      <div className="hidden sm:block text-center font-mono text-xs text-pitwall-text font-bold">
        {entry.wins}
      </div>

      {/* Points */}
      <div className={`text-right pr-2 font-mono text-sm font-bold ${isLeader ? 'text-status-yellow' : 'text-pitwall-text-strong'}`}>
        <AnimatedNumber value={pts} />
      </div>
    </motion.div>
  )
}

// ── Constructor row ───────────────────────────────────────────────────────────
function ConstructorRow({ entry, maxPts, isLeader }) {
  const teamName  = entry.Constructor?.name ?? '—'
  const teamColour= getTeamColourByName(teamName)
  const pts       = parseFloat(entry.points ?? 0)
  const slug      = teamSlug(teamName)
  const logoUrl   = `/team-logos/${slug}.svg`

  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-20px' }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="grid grid-cols-[30px_1fr_60px] sm:grid-cols-[40px_180px_1fr_70px_70px] md:grid-cols-[40px_180px_1fr_140px_70px_70px] items-center gap-3 py-3.5 border-b border-pitwall-border hover:bg-pitwall-surface/40 transition-colors px-4"
    >
      {/* Pos */}
      <div className={`text-center font-display font-black text-sm italic ${isLeader ? 'text-status-yellow' : 'text-pitwall-dim'}`}>
        {entry.position}
      </div>

      {/* Grouped: Team logo image + Team name */}
      <div className="flex items-center gap-3 min-w-0">
        <img
          src={logoUrl}
          alt={teamName}
          className="w-5 h-5 object-contain dark:invert"
          onError={(e) => {
            e.target.onerror = null
            e.target.src = '/team-logos/_fallback.svg'
          }}
        />
        <span className="font-display font-bold text-sm tracking-wide text-pitwall-text-strong uppercase truncate">
          {teamName}
        </span>
      </div>

      {/* Points bar */}
      <div className="hidden sm:block">
        <PointsBar points={pts} max={maxPts} colour={teamColour} />
      </div>

      {/* Spacer for MD screens to align columns precisely with Driver tab */}
      <div className="hidden md:block" />

      {/* Wins */}
      <div className="hidden sm:block text-center font-mono text-xs text-pitwall-text font-bold">
        {entry.wins}
      </div>

      {/* Points */}
      <div className={`text-right pr-2 font-mono text-sm font-bold ${isLeader ? 'text-status-yellow' : 'text-pitwall-text-strong'}`}>
        <AnimatedNumber value={pts} />
      </div>
    </motion.div>
  )
}

// ── Standings page ────────────────────────────────────────────────────────────
export default function Standings() {
  const [tab, setTab] = useState('DRIVERS')
  const standings = useF1Store((s) => s.standings)
  const settings  = useF1Store((s) => s.settings)

  const driverStandings = standings.drivers ?? []
  const constructorStandings = standings.constructors ?? []

  const maxDrvPts = parseFloat(driverStandings[0]?.points ?? 0)
  const maxConPts = parseFloat(constructorStandings[0]?.points ?? 0)

  return (
    <div className="min-h-full bg-pitwall-bg relative">
      {/* Header + toggle */}
      <div className="border-b border-pitwall-border px-6 py-4 flex items-center justify-between">
        <h1 className="font-display font-extrabold text-2xl tracking-widest text-pitwall-text-strong uppercase">
          Championship Standings
        </h1>
        <div className="flex border border-pitwall-border bg-pitwall-surface-2 p-0.5 rounded-sm">
          {['DRIVERS', 'CONSTRUCTORS'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 font-display text-xs tracking-widest uppercase transition-all font-bold rounded-sm ${
                tab === t ? 'bg-status-red text-white shadow-sm shadow-status-red/20' : 'text-pitwall-ghost hover:text-pitwall-text-strong'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Main standings table container with outer padding */}
      <div className="px-6 lg:px-8 py-6">
        <div className="border border-pitwall-border bg-pitwall-surface rounded-sm overflow-hidden shadow-sm">
          {/* Column headers */}
          <div className="grid grid-cols-[30px_1fr_60px] sm:grid-cols-[40px_180px_1fr_70px_70px] md:grid-cols-[40px_180px_1fr_140px_70px_70px] items-center gap-3 px-4 py-2 border-b border-pitwall-border bg-pitwall-surface-2">
            <div className="text-center font-display font-bold text-[10px] text-pitwall-dim tracking-widest">POS</div>
            <div className="font-display font-bold text-[10px] text-pitwall-dim tracking-widest">COMPETITOR</div>
            <div className="hidden sm:block font-display font-bold text-[10px] text-pitwall-dim tracking-widest">PERFORMANCE</div>
            <div className="hidden md:block font-display font-bold text-[10px] text-pitwall-dim tracking-widest uppercase text-left">
              {tab === 'DRIVERS' ? 'TEAM' : ''}
            </div>
            <div className="hidden sm:block text-center font-display font-bold text-[10px] text-pitwall-dim tracking-widest">WINS</div>
            <div className="text-right pr-2 font-display font-bold text-[10px] text-pitwall-dim tracking-widest">PTS</div>
          </div>

          {/* Rows */}
          {tab === 'DRIVERS' ? (
            <div className="divide-y divide-pitwall-border/30">
              {driverStandings.length === 0 ? (
                <div className="flex items-center justify-center h-32 font-mono text-pitwall-dim text-sm bg-carbon">
                  Season standings not yet available
                </div>
              ) : (
                driverStandings.map((entry, i) => {
                  const dNum      = entry.Driver?.permanentNumber ?? ''
                  const teamName  = entry.Constructors?.[0]?.name ?? ''
                  const teamColour= getTeamColourByName(teamName)
                  const isFav     = settings.favouriteDrivers?.includes(dNum) || settings.favouriteDrivers?.includes(entry.Driver?.driverId)
                  return (
                    <DriverStandingRow
                      key={entry.Driver?.driverId ?? i}
                      entry={entry}
                      maxPts={maxDrvPts}
                      isLeader={i === 0}
                      isFav={isFav}
                      teamColour={teamColour}
                    />
                  )
                })
              )}
            </div>
          ) : (
            <div className="divide-y divide-pitwall-border/30">
              {constructorStandings.length === 0 ? (
                <div className="flex items-center justify-center h-32 font-mono text-pitwall-dim text-sm bg-carbon">
                  Constructor standings not yet available
                </div>
              ) : (
                constructorStandings.map((entry, i) => (
                  <ConstructorRow
                    key={entry.Constructor?.constructorId ?? i}
                    entry={entry}
                    maxPts={maxConPts}
                    isLeader={i === 0}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
