import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
} from 'recharts'
import useF1Store from '../store/useF1Store'
import { EmptyState } from '../components/ui/EmptyState'
import { teamColour, canonicalTeam } from '../utils/teamColours'
import { useSeasonConstructors, useConstructorProfile, useGridMeta } from '../hooks/useDriverProfile'
import TeamLogo from '../components/ui/TeamLogo'

const SEASON = new Date().getFullYear()

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

// ── Index ───────────────────────────────────────────────────────────────────
export function TeamsIndex() {
  const standings = useF1Store((s) => s.standings)
  const { constructors, loading, error } = useSeasonConstructors(SEASON)

  // Order by championship position where we have standings — a grid ordered by
  // current form is more useful than alphabetical.
  const rows = useMemo(() => {
    const pos = {}
    for (const s of standings.constructors ?? []) {
      if (s.Constructor?.constructorId) {
        pos[s.Constructor.constructorId] = {
          position: Number(s.position),
          points: Number(s.points),
          wins: Number(s.wins),
        }
      }
    }
    return constructors
      .map((c) => ({ ...c, standing: pos[c.constructorId] ?? null }))
      .sort((a, b) => (a.standing?.position ?? 99) - (b.standing?.position ?? 99))
  }, [constructors, standings])

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 font-mono text-pitwall-dim text-sm">
        Loading {SEASON} constructors…
      </div>
    )
  }
  if (error && rows.length === 0) {
    return (
      <div className="p-6">
        <EmptyState icon="🏎️" title="Constructor list unavailable" message={`Could not reach the database (${error}).`} />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {rows.map((c, i) => {
        const accent = teamColour(c.name, { role: 'accent' })
        const text = teamColour(c.name, { role: 'text' })
        return (
          <motion.div
            key={c.constructorId}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.3) }}
          >
            <Link
              to={`/teams/${c.constructorId}`}
              className="flex items-center gap-3 p-3 border border-pitwall-border rounded-sm hover:border-pitwall-ghost transition-colors group"
              style={{ background: 'var(--pw-surface)', borderLeft: `3px solid ${accent}` }}
            >
              <TeamLogo name={c.name} size={32} />
              <div className="min-w-0 flex-1">
                <div className="font-display font-extrabold text-sm tracking-wider uppercase truncate" style={{ color: text }}>
                  {c.name}
                </div>
                <div className="font-mono text-[10px] text-pitwall-dim truncate">
                  {c.standing
                    ? `P${c.standing.position} · ${c.standing.points} pts · ${c.standing.wins} win${c.standing.wins === 1 ? '' : 's'}`
                    : c.nationality}
                </div>
              </div>
              <span className="font-mono text-[10px] text-pitwall-ghost group-hover:text-pitwall-text-strong transition-colors">›</span>
            </Link>
          </motion.div>
        )
      })}
    </div>
  )
}

// ── Detail ──────────────────────────────────────────────────────────────────
export function TeamDetail({ constructorId }) {
  const sessionKey = useF1Store((s) => s.currentSessionKey)
  const meta = useGridMeta(sessionKey)
  const { data, loading, error } = useConstructorProfile(constructorId)

  if (loading && !data) {
    return <div className="flex items-center justify-center h-64 font-mono text-pitwall-dim text-sm">Loading team history…</div>
  }
  if (error && !data) {
    return (
      <div className="p-6">
        <EmptyState
          icon="🏎️"
          title="Team unavailable"
          message={`Could not load this constructor (${error}).`}
          action={<Link to="/teams" className="font-mono text-xs underline text-pitwall-dim">Back to teams</Link>}
        />
      </div>
    )
  }

  const { profile, career, seasons, current, lineup, partial, missing, seasonFailures } = data
  const accent = teamColour(profile.name, { role: 'accent' })
  const text = teamColour(profile.name, { role: 'text' })
  const chartData = seasons.map((s) => ({ ...s, season: Number(s.season) }))

  return (
    <div>
      <div
        className="border border-pitwall-border rounded-sm p-5 mb-5"
        style={{ background: `linear-gradient(90deg, ${accent}18 0%, var(--pw-surface) 60%)` }}
      >
        <Link to="/teams" className="font-mono text-[10px] text-pitwall-ghost hover:text-pitwall-text-strong tracking-widest uppercase">
          ‹ All teams
        </Link>
        <div className="flex items-center gap-4 mt-3">
          <TeamLogo name={profile.name} size={52} />
          <div className="min-w-0">
            <h1 className="font-display font-black text-2xl tracking-wider uppercase" style={{ color: text }}>
              {profile.name}
            </h1>
            <div className="font-mono text-[11px] text-pitwall-dim mt-0.5">
              {profile.nationality}
              {career.firstSeason && ` · in F1 since ${career.firstSeason}`}
              {current && ` · P${current.position} in ${SEASON}`}
            </div>
          </div>
        </div>
      </div>

      <section className="border border-pitwall-border rounded-sm mb-5" style={{ background: 'var(--pw-surface)' }}>
        <div className="px-4 py-2 font-display text-[10px] text-pitwall-dim tracking-widest uppercase border-b border-pitwall-border bg-pitwall-surface-2 font-bold flex items-center justify-between">
          <span>Constructor Record</span>
          {partial && <span className="font-mono text-[9px] normal-case tracking-normal text-status-yellow">incomplete</span>}
        </div>
        {partial && (
          <div className="px-4 pt-3 font-mono text-[10px] text-status-yellow leading-relaxed">
            Could not fetch: {missing.join(', ')}
            {seasonFailures > 0 ? ` (${seasonFailures} season${seasonFailures === 1 ? '' : 's'} failed)` : ''}.
            Missing values show as “—” rather than a guess.
          </div>
        )}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-4 p-4">
          <Stat label="Championships" value={career.championships} accent />
          <Stat label="Wins" value={career.wins} accent />
          <Stat label="Poles" value={career.poles} accent />
          <Stat label="Fastest Laps" value={career.fastestLaps} accent />
          {/* Jolpica counts one result row per CAR, so a two-car team logs two
              per Grand Prix. Labelled as entries, not races, for that reason. */}
          <Stat label="Car Entries" value={career.entries} accent />
        </div>
      </section>

      <section className="border border-pitwall-border rounded-sm mb-5" style={{ background: 'var(--pw-surface)' }}>
        <div className="px-4 py-2 font-display text-[10px] text-pitwall-dim tracking-widest uppercase border-b border-pitwall-border bg-pitwall-surface-2 font-bold">
          {SEASON} Season
        </div>
        {current ? (
          <div className="grid grid-cols-3 gap-4 p-4">
            <Stat label="Championship Pos" value={`P${current.position}`} accent />
            <Stat label="Points" value={current.points} accent />
            <Stat label="Wins" value={current.wins} accent />
          </div>
        ) : (
          <div className="p-4">
            <EmptyState icon="📅" title={`No ${SEASON} entry`} message="This constructor has no classified standing in the current season." className="w-full my-0" />
          </div>
        )}
      </section>

      <section className="border border-pitwall-border rounded-sm mb-5" style={{ background: 'var(--pw-surface)' }}>
        <div className="px-4 py-2 font-display text-[10px] text-pitwall-dim tracking-widest uppercase border-b border-pitwall-border bg-pitwall-surface-2 font-bold">
          {SEASON} Driver Lineup
        </div>
        {lineup?.length ? (
          <div className="flex flex-wrap gap-3 p-4">
            {lineup.map((d) => {
              const m = meta.byCode[d.code] ?? {}
              return (
                <Link
                  key={d.driverId}
                  to={`/drivers/${d.driverId}`}
                  className="flex items-center gap-3 px-3 py-2 border border-pitwall-border rounded-sm hover:border-pitwall-ghost transition-colors"
                  style={{ background: 'var(--pw-bg)' }}
                >
                  {m.headshot
                    ? <img src={m.headshot} alt="" className="w-9 h-9 rounded-sm object-cover object-top" loading="lazy" />
                    : <span className="w-9 h-9 rounded-sm bg-pitwall-surface-2 flex items-center justify-center font-display font-black text-[10px] text-pitwall-ghost">{d.code}</span>}
                  <div>
                    <div className="font-display font-extrabold text-sm tracking-wider" style={{ color: text }}>
                      {d.code} <span className="text-pitwall-ghost font-mono text-[10px]">{d.permanentNumber}</span>
                    </div>
                    <div className="font-mono text-[10px] text-pitwall-dim">
                      {d.givenName} {d.familyName} · {d.starts} start{d.starts === 1 ? '' : 's'}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="p-4">
            <EmptyState icon="👥" title="No lineup recorded" message={`No driver has started a race for this team in ${SEASON}.`} className="w-full my-0" />
          </div>
        )}
      </section>

      <section className="border border-pitwall-border rounded-sm" style={{ background: 'var(--pw-surface)' }}>
        <div className="px-4 py-2 font-display text-[10px] text-pitwall-dim tracking-widest uppercase border-b border-pitwall-border bg-pitwall-surface-2 font-bold">
          Points Per Season
        </div>
        {chartData.length < 2 ? (
          <div className="p-4">
            <EmptyState icon="📈" title="Not enough seasons to chart" message="A history needs at least two classified seasons." className="w-full my-0" />
          </div>
        ) : (
          <>
            <div className="h-56 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="var(--pw-border)" vertical={false} strokeOpacity={0.4} />
                  <XAxis dataKey="season" tick={{ fill: 'var(--pw-ghost)', fontSize: 10, fontFamily: 'Orbitron' }} />
                  <YAxis tick={{ fill: 'var(--pw-ghost)', fontSize: 10, fontFamily: 'Orbitron' }} width={46} />
                  <RTooltip
                    contentStyle={{ background: 'var(--pw-surface)', border: '1px solid var(--pw-border)', borderRadius: 0 }}
                    labelStyle={{ color: 'var(--pw-dim)', fontFamily: 'Orbitron', fontSize: 10 }}
                    itemStyle={{ color: 'var(--pw-text-strong)', fontFamily: 'Orbitron', fontSize: 10 }}
                    formatter={(v) => [v, 'Points']}
                    labelFormatter={(season) => {
                      const row = chartData.find((r) => r.season === season)
                      return `${season}${row?.position ? ` · P${row.position}` : ''}${row?.wins ? ` · ${row.wins} win${row.wins === 1 ? '' : 's'}` : ''}`
                    }}
                  />
                  <Line dataKey="points" stroke={accent} strokeWidth={2} dot={{ r: 2, fill: accent }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="px-4 pb-3 font-mono text-[9px] text-pitwall-ghost leading-relaxed">
              Points totals are not comparable across eras — the scoring system has changed several
              times since 1950, and the Constructors' Championship itself only began in 1958.
              Championship position is in the tooltip and is the era-independent measure.
            </p>
          </>
        )}
      </section>
    </div>
  )
}
