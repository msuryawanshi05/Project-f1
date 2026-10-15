import { useMemo, useRef } from 'react'
import useF1Store from '../../store/useF1Store'
import { getTeamColour } from '../../utils/driverUtils'
import { findBattles, suppressionReason } from '../../utils/battles'

/**
 * Every fight on track, ranked, in the Live sidebar.
 *
 * The broadcast director shows one battle. This answers the other nine, so a
 * two-second glance says where to look next.
 *
 * Deliberately motionless. No row animations, no reordering transitions, no
 * flashing. This is read in two-second glances with attention on a television:
 * movement in peripheral vision pulls the eye to whatever moved, which is
 * almost never the row that matters. The only thing that changes between
 * renders is the text.
 */

/** Enough to be useful at a glance; more is a list, not a radar. */
const VISIBLE = 6

const TREND = {
  closing: { mark: '▼', colour: '#00C853', title: 'Gap shrinking' },
  growing: { mark: '▲', colour: 'var(--pw-ghost)', title: 'Gap growing' },
  stable:  { mark: '=', colour: 'var(--pw-dim)', title: 'Gap holding' },
  unknown: { mark: '·', colour: 'var(--pw-ghost)', title: 'Not enough laps yet' },
}

const MOM = {
  on:        { label: 'MOM', colour: '#00C853', title: 'Overtake mode deployed' },
  available: { label: 'AVL', colour: '#38bdf8', title: 'Overtake mode available' },
  off:       { label: '—', colour: 'var(--pw-ghost)', title: 'Overtake mode not available' },
}

function BattleRow({ battle, drivers }) {
  const trend = TREND[battle.trendLabel] ?? TREND.unknown
  const mom = battle.chaser.mom ? MOM[battle.chaser.mom] : null

  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 border-b"
      style={{ borderColor: 'var(--pw-border)' }}
    >
      {/* Positions, so the row can be located in the tower without reading names */}
      <span className="font-mono text-[9px] tabular-nums w-8 flex-shrink-0"
        style={{ color: 'var(--pw-ghost)' }}>
        P{battle.ahead.position}–{battle.chaser.position}
      </span>

      {/* The pair. Chaser second, matching the order on the timing screen. */}
      <span className="flex items-center gap-1 flex-1 min-w-0">
        <span className="w-[3px] h-3 flex-shrink-0"
          style={{ background: getTeamColour(battle.ahead.number, drivers, 'accent') }} />
        <span className="font-mono text-[11px] font-bold"
          style={{ color: 'var(--pw-text-strong)' }}>{battle.ahead.code}</span>
        <span className="font-mono text-[9px]" style={{ color: 'var(--pw-ghost)' }}>v</span>
        <span className="w-[3px] h-3 flex-shrink-0"
          style={{ background: getTeamColour(battle.chaser.number, drivers, 'accent') }} />
        <span className="font-mono text-[11px] font-bold"
          style={{ color: 'var(--pw-text-strong)' }}>{battle.chaser.code}</span>
      </span>

      {/* Overtake mode of the CHASER — it decides whether a pass is on */}
      {mom && (
        <span className="font-mono text-[9px] font-bold w-7 text-center flex-shrink-0"
          style={{ color: mom.colour }} title={`${battle.chaser.code}: ${mom.title}`}>
          {mom.label}
        </span>
      )}

      {/* How long it has been going */}
      {battle.laps != null && (
        <span className="font-mono text-[9px] tabular-nums w-7 text-right flex-shrink-0"
          style={{ color: 'var(--pw-ghost)' }}
          title={`Fighting for ${battle.laps} lap${battle.laps === 1 ? '' : 's'}`}>
          {battle.laps}L
        </span>
      )}

      {/* Trend, then the interval */}
      <span className="font-mono text-[10px] w-3 text-center flex-shrink-0"
        style={{ color: trend.colour }} title={trend.title}>
        {trend.mark}
      </span>
      <span className="font-mono text-[11px] tabular-nums font-bold w-12 text-right flex-shrink-0"
        style={{ color: battle.interval < 0.5 ? 'var(--pw-text-strong)' : 'var(--pw-dim)' }}>
        {battle.interval.toFixed(3)}
      </span>
    </div>
  )
}

export default function BattleRadar() {
  const timing = useF1Store((s) => s.timing)
  const drivers = useF1Store((s) => s.drivers)
  const gapHistory = useF1Store((s) => s.gapHistory)
  const trackStatus = useF1Store((s) => s.trackStatus)
  const raceControl = useF1Store((s) => s.raceControl)
  const carData = useF1Store((s) => s.carData)
  const session = useF1Store((s) => s.session)
  const replay = useF1Store((s) => s.replay)

  // How long each fight has run. A ref rather than state: it is derived from
  // the same render that reads it, and storing it in state would loop.
  const sinceRef = useRef({})

  const momByDriver = useMemo(() => {
    const out = {}
    for (const [num, d] of Object.entries(carData ?? {})) {
      if (d?.drs) out[num] = d.drs
    }
    return out
  }, [carData])

  const { battles, suppressed } = useMemo(() => {
    const r = findBattles({
      timing, gapHistory, trackStatus, raceControl, momByDriver,
      since: sinceRef.current, currentLap: session.lap,
    })
    sinceRef.current = r.since
    return r
  }, [timing, gapHistory, trackStatus, raceControl, momByDriver, session.lap])

  // Battles are a race concept. In qualifying every car is alone on a flying
  // lap and the interval column means something else entirely.
  const isRace = !/QUALI|PRACTICE|SHOOTOUT|FP\d/i.test(session.name ?? '')
  if (!isRace) return null

  const shown = battles.slice(0, VISIBLE)
  const hidden = battles.length - shown.length
  // In a replay there is no live car telemetry, so overtake mode is unknown
  // for every car. Saying so beats a column of dashes the viewer has to work
  // out for themselves.
  const momUnavailable = replay.active || Object.keys(momByDriver).length === 0

  return (
    <div className="border-t pt-3" style={{ borderColor: 'var(--pw-border)' }}>
      <div className="flex items-baseline justify-between mb-1.5 px-0.5">
        <span className="font-mono text-[10px] tracking-widest uppercase"
          style={{ color: 'var(--pw-ghost)' }}>
          Battle Radar
        </span>
        <span className="font-mono text-[9px]" style={{ color: 'var(--pw-ghost)' }}>
          {suppressed ? '—' : `${battles.length} under 1.0s`}
        </span>
      </div>

      {suppressed ? (
        <div className="font-mono text-[10px] leading-relaxed px-1 py-2"
          style={{ color: 'var(--pw-dim)' }}>
          {suppressionReason(suppressed)}
        </div>
      ) : shown.length === 0 ? (
        <div className="font-mono text-[10px] leading-relaxed px-1 py-2"
          style={{ color: 'var(--pw-ghost)' }}>
          Nobody is within a second. The field is strung out.
        </div>
      ) : (
        <>
          <div style={{ borderTop: '1px solid var(--pw-border)' }}>
            {shown.map((b) => (
              <BattleRow key={b.key} battle={b} drivers={drivers} />
            ))}
          </div>
          <div className="flex items-baseline justify-between mt-1 px-1">
            <span className="font-mono text-[9px]" style={{ color: 'var(--pw-ghost)' }}>
              {hidden > 0 ? `${hidden} more under 1.0s` : 'ranked by gap and closing rate'}
            </span>
            {momUnavailable && (
              <span className="font-mono text-[9px]" style={{ color: 'var(--pw-ghost)' }}
                title="Overtake mode comes from live car telemetry, which a replay does not carry.">
                no MOM data
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
