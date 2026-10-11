import { memo, useMemo } from 'react'
import { getTeamColour, resolveDriverCode } from '../../utils/driverUtils'
import { EmptyState } from './EmptyState'

/**
 * SpeedTrapBoard — top speeds per measurement point this session.
 *
 * Source: TimingData.Speeds{I1, I2, FL, ST}, which F1 reports as each driver's
 * best reading at each point. Those four fields were never extracted from the
 * feed until now, which is why DriverRow's `timing.speed_trap` branch could
 * never render.
 *
 * The four points are fixed timing loops, not arbitrary:
 *   I1 / I2  the two intermediate (sector) speed traps
 *   FL       speed across the finish line
 *   ST       the speed trap proper — the circuit's headline top-speed figure
 *
 * This matters more in 2026 than it used to: Manual Override Mode produces
 * large speed deltas between cars at the same point on the track, so the trap
 * board shows who is actually deploying and where.
 */

const TRAPS = [
  { key: 'speed_trap', label: 'SPEED TRAP', hint: 'Circuit speed trap (ST) — the headline top speed' },
  { key: 'speed_fl',   label: 'FINISH LINE', hint: 'Speed across the finish line (FL)' },
  { key: 'speed_i1',   label: 'INTER 1',     hint: 'First intermediate speed trap (I1)' },
  { key: 'speed_i2',   label: 'INTER 2',     hint: 'Second intermediate speed trap (I2)' },
]

const TrapColumn = memo(function TrapColumn({ label, hint, rows, drivers }) {
  const best = rows[0]?.speed ?? 0

  return (
    <div className="flex flex-col border border-pitwall-border rounded-sm overflow-hidden bg-pitwall-bg">
      <div
        className="px-2.5 py-1.5 font-display text-[9px] font-bold tracking-widest uppercase border-b border-pitwall-border bg-pitwall-surface-2 text-pitwall-dim"
        title={hint}
      >
        {label}
      </div>

      {rows.length === 0 ? (
        <div className="px-2.5 py-3 font-mono text-[10px] text-pitwall-ghost text-center">
          No readings yet
        </div>
      ) : (
        <div className="divide-y divide-pitwall-border/30">
          {rows.map((row, i) => {
            const pct = best > 0 ? (row.speed / best) * 100 : 0
            return (
              <div key={row.number} className="relative flex items-center gap-2 px-2.5 py-1">
                {/* Proportional bar, scaled to the session's best at this point */}
                <div
                  className="absolute left-0 top-0 bottom-0 opacity-15 transition-all duration-500"
                  style={{ width: `${pct}%`, background: row.colour }}
                  aria-hidden="true"
                />
                <span className="relative font-mono text-[9px] text-pitwall-ghost w-3 tabular-nums">
                  {i + 1}
                </span>
                <span
                  className="relative font-display font-extrabold text-[11px] tracking-wider flex-1 truncate"
                  style={{ color: row.colour }}
                >
                  {row.code}
                </span>
                <span
                  className={`relative timing-number text-[11px] tabular-nums ${
                    i === 0 ? 'text-sector-purple font-bold' : 'text-pitwall-text-strong'
                  }`}
                >
                  {row.speed}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})

const SpeedTrapBoard = memo(function SpeedTrapBoard({ timing, drivers, limit = 5 }) {
  const board = useMemo(() => {
    return TRAPS.map((trap) => {
      const rows = (timing ?? [])
        .map((t) => {
          const num = t.driver_number ?? t.number
          const speed = t[trap.key]
          if (num == null || speed == null || !Number.isFinite(Number(speed)) || Number(speed) <= 0) {
            return null
          }
          return {
            number: num,
            speed: Number(speed),
            code: resolveDriverCode(num, drivers),
            colour: getTeamColour(num, drivers),
          }
        })
        .filter(Boolean)
        .sort((a, b) => b.speed - a.speed)
        .slice(0, limit)
      return { ...trap, rows }
    })
  }, [timing, drivers, limit])

  const anyReadings = board.some((t) => t.rows.length > 0)

  if (!anyReadings) {
    return (
      <div className="p-6">
        <EmptyState
          icon="📡"
          title="Awaiting Speed Trap Readings"
          message="Trap speeds populate as cars cross each timing loop at racing speed."
          className="w-full my-0"
        />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 p-3">
      {board.map((trap) => (
        <TrapColumn
          key={trap.key}
          label={trap.label}
          hint={trap.hint}
          rows={trap.rows}
          drivers={drivers}
        />
      ))}
    </div>
  )
})

export default SpeedTrapBoard
