import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
} from 'recharts'
import useF1Store from '../store/useF1Store'
import { EmptyState } from '../components/ui/EmptyState'
import { getSafeTeamColour, getCountryAbbreviation } from '../utils/driverUtils'
import { teamColour, canonicalTeam } from '../utils/teamColours'
import teamsData from '../data/teams.json'
import {
  useSeasonDrivers, useGridMeta, useDriverProfile, useTeammateH2H,
} from '../hooks/useDriverProfile'
import SegmentedToggle from '../components/ui/SegmentedToggle'
import DriverCompare from '../components/ui/DriverCompare'
import { TeamsIndex, TeamDetail } from './Teams'

const SEASON = new Date().getFullYear()

/**
 * Team colour for this page.
 *
 * `role` matters: driver codes render at 14-32px as TEXT and need 4.5:1, while
 * the card's left border is a UI accent at 3:1. Passing the accent value to
 * text is what made several 2026 liveries unreadable on white.
 */
function teamColourFor(teamName, liveColour, role = 'accent') {
  if (teamName && canonicalTeam(teamName)) return teamColour(teamName, { role })
  if (liveColour) return getSafeTeamColour(liveColour, role)
  return teamColour(teamName, { role })
}

// ── Headshot with a graceful fallback ────────────────────────────────────────
function Headshot({ src, code, colour, size = 72 }) {
  const [failed, setFailed] = useState(false)
  // F1's CDN serves a generic silhouette for drivers with no official portrait
  // yet, so a missing or broken image is expected, not exceptional. Fall back
  // to the TLA rather than leaving an empty frame.
  const showImage = Boolean(src) && !failed

  return (
    <div
      className="relative flex-shrink-0 rounded-sm overflow-hidden bg-pitwall-surface-2 flex items-center justify-center"
      style={{ width: size, height: size, boxShadow: `inset 0 -2px 0 ${colour}` }}
    >
      {showImage ? (
        <img
          src={src}
          alt={`${code} headshot`}
          className="w-full h-full object-cover object-top"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="font-display font-black text-pitwall-ghost select-none"
          style={{ fontSize: size * 0.3 }}
          aria-label={code}
        >
          {code}
        </span>
      )}
    </div>
  )
}

function Stat({ label, value, accent = false }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[9px] tracking-widest uppercase text-pitwall-ghost">{label}</span>
      <span
        className={`font-display font-extrabold tabular-nums ${accent ? 'text-lg' : 'text-base'}`}
        style={{ color: accent ? 'var(--pw-text-strong)' : 'var(--pw-text)' }}
      >
        {value ?? '—'}
      </span>
    </div>
  )
}

// ── Index: the current grid ─────────────────────────────────────────────────
function DriversIndex() {
  const sessionKey = useF1Store((s) => s.currentSessionKey)
  const liveDrivers = useF1Store((s) => s.drivers)
  const { drivers, loading, error } = useSeasonDrivers(SEASON)
  const meta = useGridMeta(sessionKey)

  // Comparison mode. Two picks maximum; a third replaces the older one so the
  // control never dead-ends with nothing to do but clear.
  const [compareMode, setCompareMode] = useState(false)
  const [picked, setPicked] = useState([])

  const togglePick = useCallback((driverId) => {
    setPicked((prev) => {
      if (prev.includes(driverId)) return prev.filter((d) => d !== driverId)
      return [...prev, driverId].slice(-2)
    })
  }, [])

  // Jolpica lists every driver who appeared, including reserves. The live grid
  // (or the headshot roster) tells us who is actually racing.
  const racing = useMemo(() => {
    const onGrid = new Set([
      ...liveDrivers.map((d) => d.code).filter(Boolean),
      ...Object.keys(meta.byCode),
    ])
    const rows = drivers.map((d) => {
      const m = meta.byCode[d.code] ?? {}
      return {
        ...d,
        number: m.number ?? (Number(d.permanentNumber) || null),
        team: m.team ?? teamsData.driverTeams[String(m.number ?? d.permanentNumber)] ?? null,
        colour: teamColourFor(m.team, m.colour, 'accent'),
        textColour: teamColourFor(m.team, m.colour, 'text'),
        headshot: m.headshot ?? null,
      }
    })
    const filtered = onGrid.size > 0 ? rows.filter((r) => onGrid.has(r.code)) : rows
    return filtered.sort((a, b) => (a.team ?? '').localeCompare(b.team ?? '') || (a.number ?? 0) - (b.number ?? 0))
  }, [drivers, meta, liveDrivers])

  if (loading && racing.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 font-mono text-pitwall-dim text-sm">
        Loading {SEASON} grid…
      </div>
    )
  }

  if (error && racing.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon="👤"
          title="Driver list unavailable"
          message={`Could not reach the driver database (${error}). Career data is served by Jolpica; it will appear when the request succeeds.`}
        />
      </div>
    )
  }

  return (
    <div className="min-h-full" style={{ background: 'var(--pw-bg)' }}>
      <div className="border-b border-pitwall-border px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display font-bold text-3xl tracking-widest text-pitwall-text-strong uppercase">
            Drivers
          </h1>
          <div className="font-mono text-xs text-pitwall-dim mt-1">
            {racing.length} drivers · {SEASON} World Championship
            {compareMode && ` · ${picked.length}/2 selected`}
          </div>
        </div>
        <button
          onClick={() => { setCompareMode((v) => !v); setPicked([]) }}
          className={`font-display text-[11px] tracking-widest uppercase font-bold px-3 py-1.5 rounded-sm border transition-colors ${
            compareMode
              ? 'border-status-red text-status-red bg-status-red/10'
              : 'border-pitwall-border text-pitwall-dim hover:text-pitwall-text-strong'
          }`}
        >
          {compareMode ? 'Exit compare' : 'Compare drivers'}
        </button>
      </div>

      {compareMode && (
        <div className="px-6 pt-5">
          {picked.length === 2 ? (
            <DriverCompare driverIdA={picked[0]} driverIdB={picked[1]} onClear={() => setPicked([])} />
          ) : (
            <div className="border border-dashed border-pitwall-border rounded-sm px-4 py-3 font-mono text-[11px] text-pitwall-dim">
              Select {2 - picked.length} more driver{picked.length === 1 ? '' : 's'} to compare.
              Teammates get a direct head-to-head; drivers in different cars are shown as
              absolute totals only.
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-6">
        {racing.map((d, i) => (
          <motion.div
            key={d.driverId}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.3) }}
          >
            {(() => {
            const selected = picked.includes(d.driverId)
            const cardClass = `w-full text-left flex items-center gap-3 p-3 border rounded-sm transition-colors group ${
              selected ? 'border-status-red' : 'border-pitwall-border hover:border-pitwall-ghost'
            }`
            const cardStyle = {
              background: selected ? 'var(--pw-surface-2)' : 'var(--pw-surface)',
              borderLeft: `3px solid ${d.colour}`,
            }
            const Inner = (
              <>
              <Headshot src={d.headshot} code={d.code} colour={d.colour} size={56} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-pitwall-ghost tabular-nums">
                    {d.number ?? '—'}
                  </span>
                  <span
                    className="font-display font-extrabold text-sm tracking-wider uppercase truncate"
                    style={{ color: d.textColour }}
                  >
                    {d.code}
                  </span>
                </div>
                <div className="font-display text-xs text-pitwall-text-strong truncate">
                  {d.givenName} {d.familyName}
                </div>
                <div className="font-mono text-[10px] text-pitwall-dim truncate">
                  {d.team ?? '—'} · {getCountryAbbreviation(d.nationality)}
                </div>
              </div>
              <span className="font-mono text-[10px] text-pitwall-ghost group-hover:text-pitwall-text-strong transition-colors">
                {compareMode ? (selected ? '✓' : '+') : '›'}
              </span>
              </>
            )
            return compareMode ? (
              <button type="button" onClick={() => togglePick(d.driverId)} aria-pressed={selected} className={cardClass} style={cardStyle}>
                {Inner}
              </button>
            ) : (
              <Link to={`/drivers/${d.driverId}`} className={cardClass} style={cardStyle}>
                {Inner}
              </Link>
            )
            })()}
          </motion.div>
        ))}
      </div>
    </div>
  )
}

// ── Detail: one driver ──────────────────────────────────────────────────────
function DriverDetail({ driverId }) {
  const sessionKey = useF1Store((s) => s.currentSessionKey)
  const meta = useGridMeta(sessionKey)
  const { data, loading, error } = useDriverProfile(driverId)

  const current = data?.current ?? null
  const h2h = useTeammateH2H(driverId, current?.teamId ?? null, SEASON)

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64 font-mono text-pitwall-dim text-sm">
        Loading career data…
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="p-6">
        <EmptyState
          icon="👤"
          title="Profile unavailable"
          message={`Could not load this driver (${error}).`}
          action={<Link to="/drivers" className="font-mono text-xs underline text-pitwall-dim">Back to drivers</Link>}
        />
      </div>
    )
  }

  const { profile, career, seasons, partial, missing, seasonFailures } = data
  const m = meta.byCode[profile.code] ?? {}
  const colour = teamColourFor(current?.team ?? m.team, m.colour, 'accent')
  const textColour = teamColourFor(current?.team ?? m.team, m.colour, 'text')
  const chartData = seasons.map((s) => ({ ...s, season: Number(s.season) }))

  return (
    <div className="min-h-full" style={{ background: 'var(--pw-bg)' }}>
      {/* Header */}
      <div
        className="border-b border-pitwall-border px-6 py-5"
        style={{ background: `linear-gradient(90deg, ${colour}18 0%, transparent 60%)` }}
      >
        <Link to="/drivers" className="font-mono text-[10px] text-pitwall-ghost hover:text-pitwall-text-strong tracking-widest uppercase">
          ‹ All drivers
        </Link>
        <div className="flex items-start gap-5 mt-3">
          <Headshot src={m.headshot} code={profile.code} colour={colour} size={92} />
          <div className="min-w-0">
            <div className="flex items-baseline gap-3">
              <span className="font-display font-black text-3xl tracking-widest uppercase" style={{ color: textColour }}>
                {profile.code}
              </span>
              {m.number != null && (
                <span className="font-display font-black text-2xl text-pitwall-ghost tabular-nums">
                  {m.number}
                </span>
              )}
            </div>
            <h1 className="font-display font-bold text-xl text-pitwall-text-strong">
              {profile.givenName} {profile.familyName}
            </h1>
            <div className="font-mono text-[11px] text-pitwall-dim mt-1">
              {current?.team ?? m.team ?? '—'} · {profile.nationality}
              {profile.dateOfBirth && ` · b. ${profile.dateOfBirth}`}
            </div>
            {profile.url && (
              <a
                href={profile.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[10px] text-pitwall-ghost hover:text-pitwall-text-strong underline mt-1 inline-block"
              >
                Wikipedia ↗
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 flex flex-col gap-5">
        {/* Career totals */}
        <section className="border border-pitwall-border rounded-sm" style={{ background: 'var(--pw-surface)' }}>
          <div className="px-4 py-2 font-display text-[10px] text-pitwall-dim tracking-widest uppercase border-b border-pitwall-border bg-pitwall-surface-2 font-bold flex items-center justify-between gap-3">
            <span>Career</span>
            {partial && (
              <span className="font-mono text-[9px] normal-case tracking-normal text-status-yellow">
                incomplete
              </span>
            )}
          </div>
          {/* Jolpica rate-limits bursts, and a long career needs one request per
              season. If any of them failed, say so — a blank stat is honest, a
              number computed from a partial season list is not. */}
          {partial && (
            <div className="px-4 pt-3 font-mono text-[10px] text-status-yellow leading-relaxed">
              Could not fetch: {missing.join(', ')}. The driver database rate-limited part of
              this request{seasonFailures > 0 ? ` (${seasonFailures} season${seasonFailures === 1 ? '' : 's'} failed)` : ''}.
              Missing values show as “—” rather than a guess — reload to retry.
            </div>
          )}
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-4 p-4">
            <Stat label="Championships" value={career.championships} accent />
            <Stat label="Starts" value={career.races} accent />
            <Stat label="Wins" value={career.wins} accent />
            <Stat label="Podiums" value={career.podiums} accent />
            <Stat label="Poles" value={career.poles} accent />
            <Stat label="Fastest Laps" value={career.fastestLaps} accent />
            <Stat label="Seasons" value={career.seasonCount} accent />
          </div>
        </section>

        {/* Current season */}
        <section className="border border-pitwall-border rounded-sm" style={{ background: 'var(--pw-surface)' }}>
          <div className="px-4 py-2 font-display text-[10px] text-pitwall-dim tracking-widest uppercase border-b border-pitwall-border bg-pitwall-surface-2 font-bold">
            {SEASON} Season
          </div>
          {current ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 p-4">
              <Stat label="Championship Pos" value={current.position != null ? `P${current.position}` : '—'} accent />
              <Stat label="Points" value={current.points} accent />
              <Stat label="Wins" value={current.wins} accent />
              <Stat label="Team" value={current.team ?? '—'} />
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                icon="📅"
                title={`No ${SEASON} entry`}
                message="This driver has no classified standing in the current season."
                className="w-full my-0"
              />
            </div>
          )}
        </section>

        {/* Teammate head-to-head */}
        <section className="border border-pitwall-border rounded-sm" style={{ background: 'var(--pw-surface)' }}>
          <div className="px-4 py-2 font-display text-[10px] text-pitwall-dim tracking-widest uppercase border-b border-pitwall-border bg-pitwall-surface-2 font-bold">
            Teammate Head-to-Head · {SEASON}
          </div>
          {h2h.loading && !h2h.data ? (
            <div className="p-4 font-mono text-xs text-pitwall-dim">Comparing…</div>
          ) : !h2h.data?.mate ? (
            <div className="p-4">
              <EmptyState
                icon="⚖️"
                title="No teammate to compare"
                message="A head-to-head needs two drivers sharing the same car this season."
                className="w-full my-0"
              />
            </div>
          ) : (
            <div className="p-4 flex flex-col gap-3">
              <div className="font-mono text-[11px] text-pitwall-dim">
                vs <span className="text-pitwall-text-strong font-bold">
                  {h2h.data.mate.givenName} {h2h.data.mate.familyName}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Stat
                  label={`Race (${h2h.data.comparedRaces} compared)`}
                  value={`${h2h.data.race.wins} – ${h2h.data.race.losses}`}
                  accent
                />
                <Stat
                  label={`Qualifying (${h2h.data.comparedQuals} compared)`}
                  value={`${h2h.data.qualifying.wins} – ${h2h.data.qualifying.losses}`}
                  accent
                />
                <Stat
                  label="Avg Quali Gap"
                  value={h2h.data.avgQualGap != null
                    ? `${h2h.data.avgQualGap >= 0 ? '+' : ''}${h2h.data.avgQualGap.toFixed(3)}s`
                    : '—'}
                  accent
                />
              </div>
              <p className="font-mono text-[9px] text-pitwall-ghost leading-relaxed">
                Race record counts only rounds where both cars were classified — a retirement
                says nothing about relative pace. Qualifying compares each driver's best lap of
                the session; a negative average gap means this driver is quicker.
              </p>
            </div>
          )}
        </section>

        {/* Career arc */}
        <section className="border border-pitwall-border rounded-sm" style={{ background: 'var(--pw-surface)' }}>
          <div className="px-4 py-2 font-display text-[10px] text-pitwall-dim tracking-widest uppercase border-b border-pitwall-border bg-pitwall-surface-2 font-bold">
            Points Per Season
          </div>
          {chartData.length < 2 ? (
            <div className="p-4">
              <EmptyState
                icon="📈"
                title="Not enough seasons to chart"
                message="A career arc needs at least two completed seasons."
                className="w-full my-0"
              />
            </div>
          ) : (
            <>
              <div className="h-56 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke="var(--pw-border)" vertical={false} strokeOpacity={0.4} />
                    <XAxis
                      dataKey="season"
                      tick={{ fill: 'var(--pw-ghost)', fontSize: 10, fontFamily: 'Orbitron' }}
                    />
                    <YAxis
                      tick={{ fill: 'var(--pw-ghost)', fontSize: 10, fontFamily: 'Orbitron' }}
                      width={42}
                    />
                    <RTooltip
                      contentStyle={{ background: 'var(--pw-surface)', border: '1px solid var(--pw-border)', borderRadius: 0 }}
                      labelStyle={{ color: 'var(--pw-dim)', fontFamily: 'Orbitron', fontSize: 10 }}
                      itemStyle={{ color: 'var(--pw-text-strong)', fontFamily: 'Orbitron', fontSize: 10 }}
                      formatter={(v, name) => [v, name === 'points' ? 'Points' : name]}
                      labelFormatter={(season) => {
                        const row = chartData.find((r) => r.season === season)
                        return `${season}${row?.team ? ` · ${row.team}` : ''}${row?.position ? ` · P${row.position}` : ''}`
                      }}
                    />
                    <Line
                      dataKey="points"
                      stroke={colour}
                      strokeWidth={2}
                      dot={{ r: 2.5, fill: colour }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="px-4 pb-3 font-mono text-[9px] text-pitwall-ghost leading-relaxed">
                Points totals are not comparable across eras — the scoring system has changed
                several times since 1950, most recently in 2010. Championship position is in the
                tooltip and is the era-independent measure.
                {seasonFailures > 0 && (
                  <span className="text-status-yellow">
                    {' '}{seasonFailures} season{seasonFailures === 1 ? '' : 's'} could not be
                    fetched and {seasonFailures === 1 ? 'is' : 'are'} missing from this chart.
                  </span>
                )}
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

/**
 * One page, two views, mirroring the Standings tab.
 *
 * Drivers and teams were separate concerns competing for one nav slot; the
 * toggle keeps them together the way Standings already does for drivers and
 * constructors, using the same SegmentedToggle rather than a second lookalike.
 * The URL still distinguishes them (/drivers, /teams) so a view is linkable.
 */
export default function Drivers({ view = 'DRIVERS' }) {
  const { driverId, constructorId } = useParams()
  const navigate = useNavigate()

  // A detail page is its own thing — no toggle, it would have nothing to switch.
  if (driverId) return <DriverDetail driverId={driverId} />
  if (constructorId) {
    return (
      <div className="min-h-full p-6" style={{ background: 'var(--pw-bg)' }}>
        <TeamDetail constructorId={constructorId} />
      </div>
    )
  }

  if (view === 'TEAMS') {
    return (
      <div className="min-h-full" style={{ background: 'var(--pw-bg)' }}>
        <div className="border-b border-pitwall-border px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display font-bold text-3xl tracking-widest text-pitwall-text-strong uppercase">
              Teams
            </h1>
            <div className="font-mono text-xs text-pitwall-dim mt-1">
              {SEASON} Constructors' Championship
            </div>
          </div>
          <SegmentedToggle
            options={[{ value: 'DRIVERS', label: 'Drivers' }, { value: 'TEAMS', label: 'Teams' }]}
            value="TEAMS"
            onChange={(v) => navigate(v === 'TEAMS' ? '/teams' : '/drivers')}
            ariaLabel="Drivers or teams"
          />
        </div>
        <div className="p-6">
          <TeamsIndex />
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="px-6 pt-4 flex justify-end" style={{ background: 'var(--pw-bg)' }}>
        <SegmentedToggle
          options={[{ value: 'DRIVERS', label: 'Drivers' }, { value: 'TEAMS', label: 'Teams' }]}
          value="DRIVERS"
          onChange={(v) => navigate(v === 'TEAMS' ? '/teams' : '/drivers')}
          ariaLabel="Drivers or teams"
        />
      </div>
      <DriversIndex />
    </>
  )
}
