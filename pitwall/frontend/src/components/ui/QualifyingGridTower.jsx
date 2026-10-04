import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useF1Store from '../../store/useF1Store'
import { getTeamColour } from '../../utils/driverUtils'

function GridDriverRow({ driver, isPole, isExpanded, onToggle, drivers }) {
  const teamColour = getTeamColour(driver.number, drivers)

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

        {/* Position */}
        <div className="w-[8%] min-w-[34px] flex items-center justify-center font-bold">
          {isPole ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-500/15 dark:bg-amber-400/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 dark:border-amber-400/40 shadow-sm">
              P1
            </span>
          ) : (
            <span className={driver.position <= 3 ? 'text-pitwall-text-strong font-bold' : driver.position <= 10 ? 'text-pitwall-text' : 'text-pitwall-ghost'}>
              P{driver.position}
            </span>
          )}
        </div>

        {/* Car number & code */}
        <div className="w-[14%] min-w-[65px] flex items-center gap-1.5 pl-1">
          <span className="text-[10px] text-pitwall-ghost font-normal w-4 text-right">
            {driver.number}
          </span>
          <span className="font-bold text-pitwall-text-strong tracking-wide">
            {driver.code}
          </span>
        </div>

        {/* Driver Name & Constructor */}
        <div className="w-[28%] min-w-[110px] flex flex-col justify-center truncate pr-2">
          <span className="truncate text-pitwall-text font-medium text-[11px] leading-tight group-hover:text-pitwall-text-strong transition-colors">
            {driver.fullName || driver.familyName || driver.code}
          </span>
          <span className="truncate text-[9px] text-pitwall-ghost tracking-wider uppercase leading-none">
            {driver.constructorName}
          </span>
        </div>

        {/* Best Lap */}
        <div className="w-[18%] min-w-[75px] text-right font-bold tabular-nums pr-2">
          <span className={isPole ? 'text-amber-700 dark:text-amber-300' : 'text-pitwall-text-strong'}>
            {driver.bestTime || '—'}
          </span>
        </div>

        {/* Gap to Pole */}
        <div className="w-[15%] min-w-[65px] text-right font-medium tabular-nums pr-2">
          <span className={isPole ? 'text-amber-700 dark:text-amber-400 font-extrabold tracking-wider' : driver.gapToPole === '—' ? 'text-pitwall-ghost' : 'text-pitwall-dim'}>
            {driver.gapToPole}
          </span>
        </div>

        {/* Q3 / Session reached badge */}
        <div className="w-[12%] min-w-[50px] text-center">
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
            {isPole && (
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

export default function QualifyingGridTower({ grid = [], raceInfo, loading = false }) {
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

  return (
    <div className="flex flex-col flex-1">
      {/* Sticky Table Columns Header */}
      <div className="sticky top-0 z-10 w-full bg-pitwall-surface-2 border-b border-pitwall-border px-0">
        <div className="flex items-center h-7 px-0 w-full font-mono text-[9px] text-pitwall-ghost tracking-wider uppercase select-none">
          <div className="w-[3px]" />
          <div className="w-[8%] min-w-[34px] text-center">POS</div>
          <div className="w-[14%] min-w-[65px] pl-1">DRV</div>
          <div className="w-[28%] min-w-[110px]">DRIVER / TEAM</div>
          <div className="w-[18%] min-w-[75px] text-right pr-2">BEST LAP</div>
          <div className="w-[15%] min-w-[65px] text-right pr-2">GAP</div>
          <div className="w-[12%] min-w-[50px] text-center">SESSION</div>
          <div className="w-[5%] min-w-[20px]" />
        </div>
      </div>

      {/* Grid Rows with Q cutoffs */}
      <div className="flex-1 pb-4">
        {grid.map((d, index) => {
          const isPole = index === 0
          const showQ3Cut = index === 9 // After P10
          const showQ2Cut = index === 14 // After P15

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
