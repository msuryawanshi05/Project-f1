import { useState } from 'react'
import useF1Store from '../store/useF1Store'
import { getTeamColour } from '../utils/driverUtils'
import teamsData from '../data/teams.json'

const TEAM_COLOURS = teamsData.teamColours

function getTeamColourByName(teamName) {
  return Object.entries(TEAM_COLOURS).find(([k]) =>
    teamName?.toLowerCase().includes(k.toLowerCase())
  )?.[1] ?? '#444444'
}

// ── Points bar ────────────────────────────────────────────────────────────────
function PointsBar({ points, max, colour }) {
  const pct = max > 0 ? Math.round((parseFloat(points) / max) * 100) : 0
  return (
    <div className="w-full h-0.5 bg-pitwall-muted mt-1">
      <div
        className="h-full transition-all duration-700"
        style={{ width: `${pct}%`, backgroundColor: colour }}
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
    <div
      className={`flex items-center gap-0 py-2.5 border-b border-pitwall-border hover:bg-pitwall-surface/50 transition-colors ${isFav ? 'bg-pitwall-surface/30' : ''}`}
      style={isFav ? { boxShadow: `inset 3px 0 0 ${teamColour}` } : { paddingLeft: '3px' }}
    >
      {/* Pos */}
      <div className={`w-10 text-center font-mono text-sm ${isLeader ? 'text-[#FFD700]' : 'text-pitwall-dim'}`}>
        {entry.position}
      </div>

      {/* Team colour swatch */}
      <div className="w-1 h-5 rounded-sm flex-shrink-0 mr-3" style={{ backgroundColor: teamColour }} />

      {/* Code + name */}
      <div className="flex-1 min-w-0">
        <span className="font-mono font-medium text-sm text-white mr-2">{code}</span>
        <span className="font-body text-xs text-pitwall-dim">{d.familyName}</span>
        <PointsBar points={pts} max={p1Pts} colour={teamColour} />
      </div>

      {/* Team */}
      <div className="w-32 flex-shrink-0 font-body text-xs text-pitwall-ghost truncate text-right pr-4 hidden lg:block">
        {teamName}
      </div>

      {/* Wins */}
      <div className="w-12 text-center font-mono text-xs text-pitwall-dim">{entry.wins}</div>

      {/* Points */}
      <div className={`w-16 text-right pr-4 font-mono text-sm ${isLeader ? 'text-[#FFD700] font-bold' : 'text-pitwall-text'}`}>
        {entry.points}
      </div>
    </div>
  )
}

// ── Constructor row ───────────────────────────────────────────────────────────
function ConstructorRow({ entry, maxPts, isLeader }) {
  const teamName  = entry.Constructor?.name ?? '—'
  const teamColour= getTeamColourByName(teamName)
  const pts       = parseFloat(entry.points ?? 0)

  return (
    <div className={`flex items-center gap-0 py-3 border-b border-pitwall-border hover:bg-pitwall-surface/50 transition-colors`}
      style={{ paddingLeft: '3px' }}>
      {/* Pos */}
      <div className={`w-10 text-center font-mono text-sm ${isLeader ? 'text-[#FFD700]' : 'text-pitwall-dim'}`}>
        {entry.position}
      </div>

      {/* Team colour swatch */}
      <div className="w-4 h-4 rounded-sm flex-shrink-0 mr-3" style={{ backgroundColor: teamColour }} />

      {/* Team name */}
      <div className="flex-1 min-w-0">
        <div className="font-display font-semibold text-sm tracking-wide text-pitwall-text">{teamName}</div>
        <PointsBar points={pts} max={maxPts} colour={teamColour} />
      </div>

      {/* Wins */}
      <div className="w-12 text-center font-mono text-xs text-pitwall-dim">{entry.wins}</div>

      {/* Points */}
      <div className={`w-16 text-right pr-4 font-mono text-sm ${isLeader ? 'text-[#FFD700] font-bold' : 'text-pitwall-text'}`}>
        {entry.points}
      </div>
    </div>
  )
}

// ── Standings page ────────────────────────────────────────────────────────────
export default function Standings() {
  const [tab, setTab] = useState('DRIVERS')
  const standings = useF1Store((s) => s.standings)
  const drivers   = useF1Store((s) => s.drivers)
  const settings  = useF1Store((s) => s.settings)

  const driverStandings = standings.drivers ?? []
  const constructorStandings = standings.constructors ?? []

  const maxDrvPts = parseFloat(driverStandings[0]?.points ?? 0)
  const maxConPts = parseFloat(constructorStandings[0]?.points ?? 0)

  return (
    <div className="min-h-full bg-pitwall-bg">
      {/* Header + toggle */}
      <div className="border-b border-pitwall-border px-6 py-4 flex items-center justify-between">
        <h1 className="font-display font-bold text-3xl tracking-widest text-white uppercase">
          Standings
        </h1>
        <div className="flex border border-pitwall-border">
          {['DRIVERS', 'CONSTRUCTORS'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 font-display text-xs tracking-widest uppercase transition-colors ${
                tab === t ? 'bg-status-red text-white' : 'text-pitwall-ghost hover:text-pitwall-text'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-0 px-0 py-1.5 border-b border-pitwall-border bg-[#0d0d0d]" style={{ paddingLeft: '3px' }}>
        <div className="w-10 text-center font-mono text-[10px] text-pitwall-ghost tracking-widest">POS</div>
        <div className="w-5 mr-3" />
        <div className="flex-1 font-mono text-[10px] text-pitwall-ghost tracking-widest">NAME</div>
        {tab === 'DRIVERS' && <div className="w-32 hidden lg:block font-mono text-[10px] text-pitwall-ghost tracking-widest text-right pr-4">TEAM</div>}
        <div className="w-12 text-center font-mono text-[10px] text-pitwall-ghost tracking-widest">WINS</div>
        <div className="w-16 text-right pr-4 font-mono text-[10px] text-pitwall-ghost tracking-widest">PTS</div>
      </div>

      {/* Rows */}
      {tab === 'DRIVERS' ? (
        <div>
          {driverStandings.length === 0 ? (
            <div className="flex items-center justify-center h-32 font-mono text-pitwall-ghost text-sm">
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
        <div>
          {constructorStandings.length === 0 ? (
            <div className="flex items-center justify-center h-32 font-mono text-pitwall-ghost text-sm">
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
  )
}
