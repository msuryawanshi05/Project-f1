import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useF1Store from '../../store/useF1Store'
import { getTeamColour } from '../../utils/driverUtils'
import { gridSourceNote } from '../../utils/startingGrid'

/**
 * The grid between qualifying and the race.
 *
 * Rows come from utils/startingGrid, so a row carries BOTH positions: where the
 * driver qualified and where they actually start. Those differ whenever the
 * stewards have handed out grid penalties, and the difference is the single most
 * interesting thing on the screen during this phase — so it gets its own
 * column rather than being implied by the ordering.
 *
 * `source` says how much we actually know:
 *   'official'/'adjusted' → this is the grid
 *   'provisional'         → this is qualifying order and we say so
 */

/** ▲/▼ for places gained or lost against the qualifying result. */
function DeltaBadge({ delta, penalty }) {
  if (penalty?.kind === 'PIT_LANE') {
    return (
      <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-red-500/15 text-red-600 dark:text-[#ff6b6b] border border-red-500/30">
        PIT
      </span>
    )
  }
  if (delta == null || delta === 0) {
    return <span className="text-pitwall-ghost">—</span>
  }
  const gained = delta > 0
  return (
    <span className={`font-bold tabular-nums ${gained ? 'text-status-green' : 'text-red-600 dark:text-[#ff6b6b]'}`}>
      {gained ? '▲' : '▼'}{Math.abs(delta)}
    </span>
  )
}

function GridDriverRow({ driver, isPole, isExpanded, onToggle, drivers }) {
  const teamColour = getTeamColour(driver.number, drivers, 'accent')
  // gridPosition is null for a pit lane start — there is no grid slot to show.
  const shown = driver.gridPosition ?? driver.position
  const isPitLane = driver.penalty?.kind === 'PIT_LANE'

  return (
    <div className="border-b border-pitwall-border transition-colors hover:bg-pitwall-surface-2/60">
      <div
        onClick={onToggle}
        className="flex items-center h-9 px-0 cursor-pointer select-none text-[11px] font-mono group"
      >
        {/* Team colour indicator stripe */}
        <div
          className="w-[3px] h-full flex-shrink-0 transition-all duration-200 group-hover:w-[5px]"
          style={{ backgroundColor: teamColour }}
        />

        {/* Grid slot */}
        <div className="w-[8%] min-w-[34px] flex items-center justify-center font-bold">
          {isPitLane ? (
            <span className="text-pitwall-ghost text-[10px]">PL</span>
          ) : isPole ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-500/15 dark:bg-amber-400/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 dark:border-amber-400/40 shadow-sm">
              P1
            </span>
          ) : (
            <span className={shown <= 3 ? 'text-pitwall-text-strong font-bold' : shown <= 10 ? 'text-pitwall-text' : 'text-pitwall-ghost'}>
              P{shown}
            </span>
          )}
        </div>

        {/* Car number & code */}
        <div className="w-[13%] min-w-[62px] flex items-center gap-1.5 pl-1">
          <span className="text-[10px] text-pitwall-ghost font-normal w-4 text-right">
            {driver.number}
          </span>
          <span className="font-bold text-pitwall-text-strong tracking-wide">
            {driver.code}
          </span>
        </div>

        {/* Driver Name & Constructor */}
        <div className="w-[25%] min-w-[104px] flex flex-col justify-center truncate pr-2">
          <span className="truncate text-pitwall-text font-medium text-[11px] leading-tight group-hover:text-pitwall-text-strong transition-colors">
            {driver.fullName || driver.familyName || driver.code}
          </span>
          <span className="truncate text-[9px] text-pitwall-ghost tracking-wider uppercase leading-none">
            {driver.constructorName}
          </span>
        </div>

        {/* Best Lap */}
        <div className="w-[16%] min-w-[72px] text-right font-bold tabular-nums pr-2">
          <span className={isPole ? 'text-amber-700 dark:text-amber-300' : 'text-pitwall-text-strong'}>
            {driver.bestTime || '—'}
          </span>
        </div>

        {/* Gap to Pole */}
        <div className="w-[13%] min-w-[58px] text-right font-medium tabular-nums pr-2">
          <span className={isPole ? 'text-amber-700 dark:text-amber-400 font-extrabold tracking-wider' : driver.gapToPole === '—' ? 'text-pitwall-ghost' : 'text-pitwall-dim'}>
            {driver.gapToPole}
          </span>
        </div>

        {/* Qualified position — kept visible so the grid can be read against it */}
        <div className="w-[9%] min-w-[42px] text-center tabular-nums text-pitwall-ghost">
          {driver.qualiPosition ? `P${driver.qualiPosition}` : '—'}
        </div>

        {/* Places gained or lost */}
        <div className="w-[9%] min-w-[44px] text-center">
          <DeltaBadge delta={driver.delta} penalty={driver.penalty} />
        </div>

        {/* Q3 / Session reached badge */}
        <div className="w-[8%] min-w-[44px] text-center">
          {driver.q3 ? (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/10 dark:bg-[#ff2e2e]/20 text-red-600 dark:text-[#ff6b6b] border border-red-500/30">
              Q3
            </span>
          ) : driver.q2 ? (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-cyan-500/10 dark:bg-[#00b4ec]/20 text-cyan-700 dark:text-[#38bdf8] border border-cyan-500/30">
              Q2
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-pitwall-muted/40 text-pitwall-ghost border border-pitwall-border">
              Q1
            </span>
          )}
        </div>

        {/* Expand Chevron */}
        <div className="w-[5%] min-w-[20px] flex justify-center text-pitwall-ghost text-[9px] group-hover:text-pitwall-text-strong transition-all duration-200 pr-1">
          <span className={`inline-block transition-transform duration-200 ${isExpanded ? 'rotate-180' : 'rotate-0'}`}>
            ▼
          </span>
        </div>
      </div>

      {/* Expanded breakdown drawer — uses semantic theme variables */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden bg-pitwall-surface-2 border-t border-b border-pitwall-border px-5 py-3 text-[11px] font-mono"
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 items-center">
              <div>
                <span className="text-pitwall-ghost font-display font-bold text-[9px] uppercase tracking-widest block mb-0.5">
                  Nationality
                </span>
                <span className="text-pitwall-text-strong font-mono font-medium">
                  {driver.nationality || '—'}
                </span>
              </div>
              <div>
                <span className="text-pitwall-ghost font-display font-bold text-[9px] uppercase tracking-widest block mb-0.5">
                  Q1 Time
                </span>
                <span className="text-pitwall-text-strong font-mono font-bold tabular-nums">
                  {driver.q1 || '—'}
                </span>
              </div>
              <div>
                <span className="text-pitwall-ghost font-display font-bold text-[9px] uppercase tracking-widest block mb-0.5">
                  Q2 Time
                </span>
                <span className="text-pitwall-text-strong font-mono font-bold tabular-nums">
                  {driver.q2 || '—'}
                </span>
              </div>
              <div>
                <span className="text-pitwall-ghost font-display font-bold text-[9px] uppercase tracking-widest block mb-0.5">
                  Q3 Time
                </span>
                <span className={`font-mono font-bold tabular-nums ${isPole ? 'text-amber-700 dark:text-amber-300' : 'text-pitwall-text-strong'}`}>
                  {driver.q3 || '—'}
                </span>
              </div>
            </div>
            {/* The stewards' own wording, not our summary of it. If the grid
                moved, the viewer should be able to see why. */}
            {driver.penalty?.reason && (
              <div className="mt-2.5 pt-2 border-t border-pitwall-border text-[10px] flex items-start gap-1.5">
                <span className="font-display font-bold tracking-widest uppercase text-red-600 dark:text-[#ff6b6b] flex-shrink-0">
                  Penalty
                </span>
                <span className="text-pitwall-dim leading-relaxed">{driver.penalty.reason}</span>
              </div>
            )}
            {isPole && !driver.penalty && (
              <div className="mt-2.5 pt-2 border-t border-pitwall-border text-amber-700 dark:text-amber-300 text-[10px] flex items-center gap-1.5 font-bold tracking-wider">
                🏁 STARTS ON POLE POSITION · {driver.bestTime}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function QualifyingGridTower({
  grid = [],
  raceInfo,
  loading = false,
  source = 'provisional',
  penaltyCount = 0,
}) {
  const drivers = useF1Store((s) => s.drivers)
  const [expandedDriver, setExpandedDriver] = useState(null)

  const handleToggle = (num) => {
    setExpandedDriver((prev) => (prev === num ? null : num))
  }

  if (loading && (!grid || grid.length === 0)) {
    return (
      <div className="p-4 flex flex-col gap-2">
        <div className="text-xs font-mono text-pitwall-dim animate-pulse">Loading starting grid data...</div>
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="h-8 bg-pitwall-muted/40 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (!grid || grid.length === 0) {
    return null
  }

  // The Q3/Q2 knockout lines describe qualifying ORDER. Once penalties have
  // reordered the grid, index 9 is no longer "the Q3 cut" and drawing the line
  // there would be a straightforwardly false statement.
  const showKnockoutLines = source === 'provisional'

  return (
    <div className="flex flex-col flex-1">
      {/* Where this grid came from. Stated before the rows, because it changes
          what the rows mean. */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 border-b border-pitwall-border"
        style={{ background: 'var(--pw-surface-2)' }}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${source === 'provisional' ? 'bg-pitwall-ghost' : 'bg-status-green'}`}
          aria-hidden="true"
        />
        <span className="font-mono text-[10px] leading-relaxed" style={{ color: 'var(--pw-dim)' }}>
          {gridSourceNote(source, penaltyCount)}
        </span>
      </div>

      {/* Sticky Table Columns Header */}
      <div className="sticky top-0 z-10 w-full bg-pitwall-surface-2 border-b border-pitwall-border px-0">
        <div className="flex items-center h-7 px-0 w-full font-mono text-[9px] text-pitwall-ghost tracking-wider uppercase select-none">
          <div className="w-[3px]" />
          <div className="w-[8%] min-w-[34px] text-center">GRID</div>
          <div className="w-[13%] min-w-[62px] pl-1">DRV</div>
          <div className="w-[25%] min-w-[104px]">DRIVER / TEAM</div>
          <div className="w-[16%] min-w-[72px] text-right pr-2">BEST LAP</div>
          <div className="w-[13%] min-w-[58px] text-right pr-2">GAP</div>
          <div className="w-[9%] min-w-[42px] text-center">QUALI</div>
          <div className="w-[9%] min-w-[44px] text-center">+/−</div>
          <div className="w-[8%] min-w-[44px] text-center">SEG</div>
          <div className="w-[5%] min-w-[20px]" />
        </div>
      </div>

      {/* Grid rows */}
      <div className="flex-1 pb-4">
        {grid.map((d, index) => {
          const isPole = (d.gridPosition ?? d.position) === 1
          const showQ3Cut = showKnockoutLines && index === 9
          const showQ2Cut = showKnockoutLines && index === 14

          return (
            <div key={d.number || index}>
              <GridDriverRow
                driver={d}
                isPole={isPole}
                isExpanded={expandedDriver === d.number}
                onToggle={() => handleToggle(d.number)}
                drivers={drivers}
              />

              {showQ3Cut && (
                <div className="flex items-center gap-2 px-4 py-1.5 bg-pitwall-surface-2 border-y border-pitwall-border select-none">
                  <div className="flex-1 h-px bg-pitwall-border" />
                  <span className="font-mono text-[9px] text-red-600 dark:text-[#ff6b6b] tracking-widest uppercase font-bold">
                    ─── TOP 10 SHOOTOUT (Q3) / Q2 KNOCKOUT ───
                  </span>
                  <div className="flex-1 h-px bg-pitwall-border" />
                </div>
              )}

              {showQ2Cut && (
                <div className="flex items-center gap-2 px-4 py-1.5 bg-pitwall-surface-2 border-y border-pitwall-border select-none">
                  <div className="flex-1 h-px bg-pitwall-border" />
                  <span className="font-mono text-[9px] text-pitwall-ghost tracking-widest uppercase font-bold">
                    ─── Q1 KNOCKOUT (ELIMINATED P16 - P22) ───
                  </span>
                  <div className="flex-1 h-px bg-pitwall-border" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
