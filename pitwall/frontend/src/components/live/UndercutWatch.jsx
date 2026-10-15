import { useMemo } from 'react'
import useF1Store from '../../store/useF1Store'
import { getTeamColour } from '../../utils/driverUtils'
import { findPitWindow, UNDERCUT_DISCLAIMER, Confidence } from '../../utils/undercut'

/**
 * Cars that look like they are about to pit.
 *
 * Turns "why did he pit?" into "he is about to pit" — but only as far as the
 * data supports. This is a two-signal heuristic over tyre age and recent pace,
 * stated in the panel itself, and every row carries its own confidence. A
 * number that looks like a prediction and is wrong is worse than no number,
 * so the weak rows say they are weak rather than being hidden or dressed up.
 */

const VISIBLE = 5

const CONFIDENCE = {
  [Confidence.HIGH]:   { label: 'LIKELY', colour: '#00C853' },
  [Confidence.MEDIUM]: { label: 'MAYBE',  colour: '#FFD200' },
  [Confidence.LOW]:    { label: 'WEAK',   colour: 'var(--pw-ghost)' },
}

export default function UndercutWatch() {
  const timing = useF1Store((s) => s.timing)
  const tyres = useF1Store((s) => s.tyres)
  const drivers = useF1Store((s) => s.drivers)
  const gapHistory = useF1Store((s) => s.gapHistory)
  const trackStatus = useF1Store((s) => s.trackStatus)
  const session = useF1Store((s) => s.session)

  const { candidates, suppressed } = useMemo(
    () => findPitWindow({
      timing, tyres, gapHistory, trackStatus,
      currentLap: session.lap, totalLaps: session.total_laps,
    }),
    [timing, tyres, gapHistory, trackStatus, session.lap, session.total_laps],
  )

  // Only a race has a pit window worth watching. In practice the stops are
  // arbitrary and in qualifying there are none.
  if (/QUALI|PRACTICE|SHOOTOUT|FP\d/i.test(session.name ?? '')) return null
  if (suppressed) return null

  const shown = candidates.slice(0, VISIBLE)

  return (
    <div className="border-t pt-3 mt-3" style={{ borderColor: 'var(--pw-border)' }}>
      <div className="flex items-baseline justify-between mb-1.5 px-0.5">
        <span className="font-mono text-[10px] tracking-widest uppercase"
          style={{ color: 'var(--pw-ghost)' }}>
          Pit window
        </span>
        <span className="font-mono text-[9px]" style={{ color: 'var(--pw-ghost)' }}>
          inferred
        </span>
      </div>

      {shown.length === 0 ? (
        <div className="font-mono text-[10px] px-1 py-2" style={{ color: 'var(--pw-ghost)' }}>
          Nobody is deep enough into a stint yet.
        </div>
      ) : (
        <div style={{ borderTop: '1px solid var(--pw-border)' }}>
          {shown.map((c) => {
            const conf = CONFIDENCE[c.confidence]
            return (
              <div
                key={c.number}
                className="flex items-center gap-2 px-2 py-1.5 border-b"
                style={{ borderColor: 'var(--pw-border)' }}
                title={c.reasons.join(' · ')}
              >
                <span className="font-mono text-[9px] tabular-nums w-5 flex-shrink-0"
                  style={{ color: 'var(--pw-ghost)' }}>P{c.position}</span>
                <span className="w-[3px] h-3 flex-shrink-0"
                  style={{ background: getTeamColour(c.number, drivers, 'accent') }} />
                <span className="font-mono text-[11px] font-bold flex-1"
                  style={{ color: 'var(--pw-text-strong)' }}>{c.code}</span>
                <span className="font-mono text-[9px] tabular-nums flex-shrink-0"
                  style={{ color: 'var(--pw-dim)' }}>
                  {c.compound.slice(0, 1)}{c.age}
                </span>
                {c.droppingOff && (
                  <span className="font-mono text-[9px] tabular-nums flex-shrink-0"
                    style={{ color: '#FFD200' }}
                    title={`Losing ${c.paceLoss.toFixed(1)}s a lap to the leader`}>
                    −{c.paceLoss.toFixed(1)}
                  </span>
                )}
                <span className="font-mono text-[9px] font-bold w-12 text-right flex-shrink-0"
                  style={{ color: conf.colour }}>
                  {conf.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <p className="font-mono text-[9px] leading-relaxed mt-1.5 px-1"
        style={{ color: 'var(--pw-ghost)' }}>
        {UNDERCUT_DISCLAIMER}
      </p>
    </div>
  )
}
