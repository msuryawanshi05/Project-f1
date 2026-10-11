import { memo } from 'react'
import { useDriverProfile, useTeammateH2H } from '../../hooks/useDriverProfile'
import { teamColour } from '../../utils/teamColours'
import { EmptyState } from './EmptyState'

const SEASON = new Date().getFullYear()

/**
 * DriverCompare — side-by-side comparison of two drivers.
 *
 * The important distinction this makes, and the reason it is not just two
 * stat columns: a head-to-head record only means something when both drivers
 * had the same machinery. Comparing a Red Bull driver's finishing positions
 * with a Haas driver's and declaring a winner is not a contest, it is a
 * statement about the cars.
 *
 * So: teammates get a real H2H (qualifying and race record, same car). Anyone
 * else gets absolute career numbers with the comparison explicitly framed as
 * context, not a verdict, and the better/worse highlighting withheld for
 * rate-style stats that different machinery makes meaningless.
 */

function Row({ label, a, b, better, note }) {
  // `better`: 'high' | 'low' | null. null = do not declare a winner.
  const na = Number(a)
  const nb = Number(b)
  const comparable = better && Number.isFinite(na) && Number.isFinite(nb) && na !== nb
  const aWins = comparable && (better === 'high' ? na > nb : na < nb)
  const bWins = comparable && !aWins

  const cell = (v, win) => (
    <div
      className={`font-display font-extrabold tabular-nums text-lg ${win ? 'text-pitwall-text-strong' : 'text-pitwall-dim'}`}
    >
      {v ?? '—'}
      {win && <span className="ml-1.5 text-[10px] align-middle text-status-green">▲</span>}
    </div>
  )

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-2.5 border-b border-pitwall-border/40 last:border-0">
      <div className="text-right">{cell(a, aWins)}</div>
      <div className="text-center min-w-[140px]">
        <div className="font-mono text-[9px] tracking-widest uppercase text-pitwall-ghost">{label}</div>
        {note && <div className="font-mono text-[8px] text-pitwall-ghost/70 mt-0.5">{note}</div>}
      </div>
      <div className="text-left">{cell(b, bWins)}</div>
    </div>
  )
}

const DriverCompare = memo(function DriverCompare({ driverIdA, driverIdB, onClear }) {
  const a = useDriverProfile(driverIdA)
  const b = useDriverProfile(driverIdB)

  // A real head-to-head is only fetched when they actually share a car.
  const sameTeam = a.data?.current?.teamId && a.data.current.teamId === b.data?.current?.teamId
  const h2h = useTeammateH2H(sameTeam ? driverIdA : null, sameTeam ? a.data.current.teamId : null, SEASON)

  if (a.loading || b.loading) {
    return <div className="p-6 font-mono text-xs text-pitwall-dim">Loading comparison…</div>
  }
  if (a.error || b.error || !a.data || !b.data) {
    return (
      <div className="p-6">
        <EmptyState icon="⚖️" title="Comparison unavailable" message={a.error || b.error || 'One of these drivers could not be loaded.'} className="w-full my-0" />
      </div>
    )
  }

  const pa = a.data.profile
  const pb = b.data.profile
  const ca = a.data.career
  const cb = b.data.career
  const colA = teamColour(a.data.current?.team, { role: 'text' })
  const colB = teamColour(b.data.current?.team, { role: 'text' })

  // Confirm the pairing really is the H2H we fetched — the hook resolves the
  // teammate itself and could land on a third driver at a three-car team.
  const h2hApplies = sameTeam && h2h.data?.mate?.driverId === driverIdB

  return (
    // Capped and centred: the three-column layout is read by scanning across
    // the middle label, and at full width on a wide screen the two value
    // columns end up hundreds of pixels apart with dead space outside them.
    <div
      className="border border-pitwall-border rounded-sm overflow-hidden mx-auto w-full"
      style={{ background: 'var(--pw-surface)', maxWidth: 860 }}
    >
      {/* Heads */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-3 bg-pitwall-surface-2 border-b border-pitwall-border">
        <div className="text-right min-w-0">
          <div className="font-display font-black text-xl tracking-wider uppercase truncate" style={{ color: colA }}>{pa.code}</div>
          <div className="font-mono text-[10px] text-pitwall-dim truncate">{pa.givenName} {pa.familyName}</div>
          <div className="font-mono text-[9px] text-pitwall-ghost truncate">{a.data.current?.team ?? '—'}</div>
        </div>
        <div className="text-center">
          <span className="font-display text-[10px] tracking-widest text-pitwall-ghost">VS</span>
          {onClear && (
            <button
              onClick={onClear}
              className="block mt-1 font-mono text-[9px] text-pitwall-ghost hover:text-pitwall-text-strong underline"
            >
              clear
            </button>
          )}
        </div>
        <div className="text-left min-w-0">
          <div className="font-display font-black text-xl tracking-wider uppercase truncate" style={{ color: colB }}>{pb.code}</div>
          <div className="font-mono text-[10px] text-pitwall-dim truncate">{pb.givenName} {pb.familyName}</div>
          <div className="font-mono text-[9px] text-pitwall-ghost truncate">{b.data.current?.team ?? '—'}</div>
        </div>
      </div>

      {/* Same car: a genuine contest */}
      {h2hApplies ? (
        <>
          <div className="px-4 py-2 font-display text-[10px] tracking-widest uppercase text-status-green border-b border-pitwall-border bg-status-green/5 font-bold">
            Teammates · same car · direct head-to-head
          </div>
          <Row
            label="Race record"
            note={`${h2h.data.comparedRaces} rounds both classified`}
            a={h2h.data.race.wins}
            b={h2h.data.race.losses}
            better="high"
          />
          <Row
            label="Qualifying record"
            note={`${h2h.data.comparedQuals} sessions compared`}
            a={h2h.data.qualifying.wins}
            b={h2h.data.qualifying.losses}
            better="high"
          />
          <Row
            label="Avg qualifying gap"
            note="negative = quicker"
            a={h2h.data.avgQualGap != null ? `${h2h.data.avgQualGap >= 0 ? '+' : ''}${h2h.data.avgQualGap.toFixed(3)}s` : '—'}
            b={h2h.data.avgQualGap != null ? `${h2h.data.avgQualGap <= 0 ? '+' : '-'}${Math.abs(h2h.data.avgQualGap).toFixed(3)}s` : '—'}
            better={null}
          />
        </>
      ) : (
        <div className="px-4 py-2.5 border-b border-pitwall-border bg-pitwall-surface-2/60">
          <div className="font-display text-[10px] tracking-widest uppercase text-pitwall-dim font-bold">
            Different teams · absolute totals only
          </div>
          <p className="font-mono text-[9px] text-pitwall-ghost leading-relaxed mt-1">
            These two do not share a car, so there is no head-to-head to report. The numbers below
            are career and season totals side by side — context, not a contest: they reflect the
            machinery each driver has had as much as the driver.
          </p>
        </div>
      )}

      {/* Career totals — counting stats, so "more is better" is fair to state */}
      <div className="px-4 py-2 font-display text-[10px] tracking-widest uppercase text-pitwall-dim border-y border-pitwall-border bg-pitwall-surface-2 font-bold">
        Career
      </div>
      <Row label="Championships" a={ca.championships} b={cb.championships} better="high" />
      <Row label="Race starts" a={ca.races} b={cb.races} better="high" />
      <Row label="Wins" a={ca.wins} b={cb.wins} better="high" />
      <Row label="Podiums" a={ca.podiums} b={cb.podiums} better="high" />
      <Row label="Poles" a={ca.poles} b={cb.poles} better="high" />
      <Row label="Fastest laps" a={ca.fastestLaps} b={cb.fastestLaps} better="high" />
      <Row
        label="Win rate"
        note="wins per start"
        a={ca.races ? `${((ca.wins / ca.races) * 100).toFixed(1)}%` : '—'}
        b={cb.races ? `${((cb.wins / cb.races) * 100).toFixed(1)}%` : '—'}
        better={null}
      />
      <Row label="Seasons" a={ca.seasonCount} b={cb.seasonCount} better="high" />

      <div className="px-4 py-2 font-display text-[10px] tracking-widest uppercase text-pitwall-dim border-y border-pitwall-border bg-pitwall-surface-2 font-bold">
        {SEASON} Season
      </div>
      <Row
        label="Championship pos"
        a={a.data.current ? `P${a.data.current.position}` : '—'}
        b={b.data.current ? `P${b.data.current.position}` : '—'}
        better={null}
      />
      <Row label="Points" a={a.data.current?.points} b={b.data.current?.points} better="high" />
      <Row label="Wins" a={a.data.current?.wins} b={b.data.current?.wins} better="high" />

      <p className="px-4 py-3 font-mono text-[9px] text-pitwall-ghost leading-relaxed border-t border-pitwall-border">
        Win rate and the qualifying gap are deliberately not marked with a winner: career rates
        depend heavily on era and machinery, and a single signed gap cannot be “won” by both sides.
        Points totals are not comparable across scoring eras.
      </p>
    </div>
  )
})

export default DriverCompare
