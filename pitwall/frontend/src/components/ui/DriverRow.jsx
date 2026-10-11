import { memo, useRef, useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import TyreIcon from './TyreIcon'
import SectorTime from './SectorTime'
import MomIndicator from './MomIndicator'
import { formatLapTime, formatGap, resolveDriverCode, resolveDriver } from '../../utils/driverUtils'
import { useFlashOnChange } from '../../hooks/useFlashOnChange'
import { Tooltip } from './Tooltip'
import useF1Store from '../../store/useF1Store'
import { getTowerColumns, towerGridTemplate, TOWER_ROW_HEIGHT } from '../../utils/layoutConstants'

/**
 * DriverRow — one row of the live timing tower.
 *
 * Cells are built by iterating the SAME column list the header iterates
 * (utils/layoutConstants.js), looked up by key. A column therefore cannot
 * appear in the header without appearing in the row, or vice versa, and the two
 * cannot fall out of horizontal alignment.
 *
 * `mode` is 'QUALI' or 'RACE' and selects the column set: qualifying shows BEST
 * LAP (which is what decides the order) and drops the pit counter and MOM dot.
 */
const DriverRow = memo(function DriverRow({
  driver,
  timing,
  tyre,
  // Accent (the 4px bar, favourite glow) and text (the driver code) are
  // different roles with different contrast thresholds: the code is 14px text
  // and needs 4.5:1, the bar only needs 3:1 as a UI component.
  teamColour = '#444444',
  teamTextColour,
  isFavourite = false,
  expanded = false,
  onExpand,
  isBattling = false,
  showSidebar = true,
  penalty = null,
  mode = 'RACE',
}) {
  const density = useF1Store((s) => s.settings.density)
  const isCompact = density === 'compact'
  const driverNum = driver?.number ?? timing?.driver_number
  const isQuali = mode === 'QUALI'

  const columns = getTowerColumns(mode)

  const resolved = resolveDriver(driverNum, driver ? [driver] : [])
  const code = (driver?.code && isNaN(Number(driver.code)))
    ? driver.code
    : (resolved?.code ?? resolveDriverCode(driverNum, driver ? [driver] : []))
  const pos = timing?.position ?? driver?.position ?? '—'

  // Qualifying reports gaps in Stats[]; the race fields carry race deltas.
  const rawGap = isQuali
    ? (timing?.quali_gap_to_leader || timing?.gap_to_leader)
    : (timing?.gap_to_leader ?? timing?.gap)
  const rawInt = isQuali
    ? (timing?.quali_gap_to_ahead || timing?.gap_to_ahead)
    : timing?.gap_to_ahead

  const gap = formatGap(rawGap, pos)

  // Use direct field; if null, try summing sector times as fallback
  const lastLap = useMemo(() => {
    if (timing?.last_lap_time_in_s != null) return timing.last_lap_time_in_s
    const s1 = timing?.s1_time_in_s
    const s2 = timing?.s2_time_in_s
    const s3 = timing?.s3_time_in_s
    if (s1 != null && s2 != null && s3 != null) return s1 + s2 + s3
    return null
  }, [timing?.last_lap_time_in_s, timing?.s1_time_in_s, timing?.s2_time_in_s, timing?.s3_time_in_s])

  const bestLap = timing?.best_lap_time_in_s ?? null
  const isPitting = timing?.pitting ?? false
  const lapDeleted = timing?.last_lap_deleted ?? false
  const isFastestLap = timing?.overall_fastest ?? false
  // `Retired` is the terminal state. `Stopped` only means the car is stationary
  // at this instant and clears again if the driver recovers and rejoins, so a
  // spin used to permanently mark a running driver as RETIRED.
  const isRetired = timing?.retired === true
  const isStoppedOnTrack = timing?.stopped === true && !isRetired
  const isOutOfRace = isRetired || timing?.knockout === true

  // Pit stop count. `pit_count` now comes straight from TimingData's
  // NumberOfPitStops; the stint-derived value remains as a fallback for feeds
  // that omit it (stint 1 = 0 stops, stint 2 = 1 stop, ...).
  const pitCount = useMemo(() => {
    if (timing?.pit_count != null && !isNaN(Number(timing.pit_count))) {
      return Number(timing.pit_count)
    }
    if (tyre?.stint_number != null && tyre.stint_number > 0) {
      return Math.max(0, tyre.stint_number - 1)
    }
    if (Array.isArray(tyre?.stints) && tyre.stints.length > 0) {
      return Math.max(0, tyre.stints.length - 1)
    }
    return 0
  }, [timing?.pit_count, tyre?.stint_number, tyre?.stints])

  // Sector colours arrive as names ("purple"|"green"|"yellow"|"pit") from the
  // backend, which reads them off each sector's OverallFastest/PersonalFastest
  // flags. Empty string means the sector has not been set yet.
  const s1Code = timing?.s1_colour || 'white'
  const s2Code = timing?.s2_colour || 'white'
  const s3Code = timing?.s3_colour || 'white'

  const lapColour = timing?.overall_fastest ? 'purple'
    : timing?.personal_fastest ? 'green'
    : 'yellow'

  // In qualifying the BEST lap is what goes purple for the session leader.
  const bestLapColour = timing?.best_lap_overall_fastest ? 'purple' : 'green'

  const positionFlash = useFlashOnChange(pos)
  const gapFlash = useFlashOnChange(rawGap)
  const lapFlash = useFlashOnChange(lastLap)
  const bestLapFlash = useFlashOnChange(bestLap)
  const pitCountFlash = useFlashOnChange(pitCount)

  const prevPos = useRef(pos)
  const [direction, setDirection] = useState(null)

  useEffect(() => {
    if (pos && prevPos.current && prevPos.current !== pos && prevPos.current !== '—') {
      const prevInt = parseInt(prevPos.current, 10)
      const currInt = parseInt(pos, 10)
      if (!isNaN(prevInt) && !isNaN(currInt)) {
        setDirection(currInt < prevInt ? 'up' : 'down')
        const t = setTimeout(() => setDirection(null), 2500)
        return () => clearTimeout(t)
      }
    }
    prevPos.current = pos
  }, [pos])

  const rowBg = isPitting
    ? 'bg-pitwall-surface-2'
    : isOutOfRace
    ? 'bg-red-950/10 border-b border-pitwall-border opacity-50'
    : 'bg-pitwall-surface/60 backdrop-blur-[2px] border-b border-pitwall-border hover:bg-pitwall-surface-2'

  let shadowParts = []
  if (isFavourite) {
    shadowParts.push(`inset 3px 0 0 ${teamColour}, 0 0 10px ${teamColour}22`)
  }
  if (isFastestLap) {
    shadowParts.push(`inset 0 0 12px rgba(180,104,255,0.15)`)
  }
  const rowShadow = shadowParts.join(', ')

  const timeSize = isCompact ? 'text-[11px]' : 'text-xs'

  // ── Cell renderers, keyed to match layoutConstants column keys ────────────
  const cells = {
    accent: (
      <div key="accent" className="h-full self-stretch" style={{ backgroundColor: teamColour }} />
    ),

    pos: (
      <div
        key="pos"
        className={`text-center font-display font-extrabold ${isCompact ? 'text-xs' : 'text-sm'} text-pitwall-text-strong italic relative flex items-center justify-center`}
      >
        <motion.span
          animate={positionFlash ? { backgroundColor: ['rgba(232,0,45,0.3)', 'rgba(232,0,45,0)'] } : {}}
          transition={{ duration: 0.6 }}
          className={`px-1 rounded ${isOutOfRace ? 'text-red-500' : ''}`}
        >
          {isOutOfRace ? 'OUT' : pos}
        </motion.span>
        {direction && (
          <motion.span
            initial={{ opacity: 0, y: direction === 'up' ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className={`absolute right-0 text-[8px] font-bold ${
              direction === 'up' ? 'text-status-green' : 'text-status-red'
            }`}
          >
            {direction === 'up' ? '▲' : '▼'}
          </motion.span>
        )}
      </div>
    ),

    // Car number. Real F1 towers always show it — it is how marshals, radio and
    // race control refer to a driver, and penalty messages name cars not codes.
    car: (
      <div
        key="car"
        className="text-center font-mono text-[10px] text-pitwall-ghost tabular-nums"
      >
        {driverNum ?? '—'}
      </div>
    ),

    drv: (
      <div
        key="drv"
        className={`flex items-center min-w-0 font-display font-extrabold ${isCompact ? 'text-xs' : 'text-[14px]'} uppercase pl-1`}
        style={{ color: teamTextColour ?? teamColour }}
      >
        {penalty && (
          <Tooltip content={penalty.message || `Penalty: ${penalty.label}`}>
            <span className="inline-flex items-center justify-center font-mono font-black text-[9px] px-1 py-0.5 rounded leading-none flex-shrink-0 bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/40 shadow-sm animate-pulse mr-1">
              <span className="mr-0.5 text-[8px]">⚠️</span>
              {penalty.label}
            </span>
          </Tooltip>
        )}
        <Tooltip content={resolved?.name || `${driver?.givenName ?? ''} ${driver?.familyName ?? ''}`.trim() || `Driver #${driverNum}`}>
          <span className={`tracking-wider truncate ${isOutOfRace ? 'line-through text-pitwall-dim' : ''}`}>{code}</span>
        </Tooltip>
      </div>
    ),

    gap: (
      <div key="gap" className={`min-w-0 font-mono ${timeSize} text-pitwall-dim truncate`}>
        {isOutOfRace ? (
          <span className="text-red-400 font-bold px-1.5 py-0.5 bg-red-900/20 border border-red-800/30 rounded-sm text-[10px] tracking-wider font-display">
            {timing?.knockout && !isRetired ? 'OUT' : 'RETIRED'}
          </span>
        ) : isStoppedOnTrack ? (
          <span className="text-orange-400 font-bold px-1.5 py-0.5 bg-orange-900/20 border border-orange-800/30 rounded-sm text-[10px] tracking-wider font-display">STOPPED</span>
        ) : isPitting ? (
          <span className="text-status-yellow font-bold px-1.5 py-0.5 bg-status-yellow/10 border border-status-yellow/20 rounded-sm text-[10px] tracking-wider font-display">PIT IN</span>
        ) : (
          <motion.span
            animate={gapFlash ? { backgroundColor: ['rgba(232,0,45,0.25)', 'rgba(232,0,45,0)'] } : {}}
            transition={{ duration: 0.6 }}
            className="px-1 rounded font-semibold text-pitwall-text-strong"
          >
            {gap}
          </motion.span>
        )}
      </div>
    ),

    // Interval to the car ahead — the number that says whether a driver is
    // genuinely in a fight. Always been in the payload, never rendered.
    int: (
      <div key="int" className={`min-w-0 font-mono ${timeSize} text-pitwall-dim truncate`}>
        {isOutOfRace || isPitting || pos === 1 || pos === '1' ? (
          <span className="text-pitwall-ghost px-1">—</span>
        ) : (
          <span className="px-1">{rawInt || '—'}</span>
        )}
      </div>
    ),

    bestLap: (
      <div
        key="bestLap"
        className={`min-w-0 timing-number font-bold ${timeSize} ${
          bestLapColour === 'purple' ? 'sector-purple' : 'sector-green'
        }`}
      >
        <motion.span
          animate={bestLapFlash ? { backgroundColor: ['rgba(180,104,255,0.25)', 'rgba(180,104,255,0)'] } : {}}
          transition={{ duration: 0.6 }}
          className="px-1 rounded"
        >
          {bestLap != null ? formatLapTime(bestLap) : '—:——.———'}
        </motion.span>
      </div>
    ),

    lastLap: (
      <div
        key="lastLap"
        className={`min-w-0 timing-number font-bold ${timeSize} ${
          lapColour === 'purple' ? 'sector-purple' : lapColour === 'green' ? 'sector-green' : 'sector-yellow'
        } ${lapDeleted ? 'lap-deleted' : ''}`}
      >
        {isPitting ? (
          '—:——.———'
        ) : (
          <motion.span
            animate={lapFlash ? { backgroundColor: ['rgba(232,0,45,0.25)', 'rgba(232,0,45,0)'] } : {}}
            transition={{ duration: 0.6 }}
            className="px-1 rounded"
          >
            {formatLapTime(lastLap)}
          </motion.span>
        )}
      </div>
    ),

    s1: (
      <div key="s1" className="flex items-center justify-center">
        <SectorTime seconds={timing?.s1_time_in_s} colourClass={s1Code} />
      </div>
    ),
    s2: (
      <div key="s2" className="flex items-center justify-center">
        <SectorTime seconds={timing?.s2_time_in_s} colourClass={s2Code} />
      </div>
    ),
    s3: (
      <div key="s3" className="flex items-center justify-center">
        <SectorTime seconds={timing?.s3_time_in_s} colourClass={s3Code} />
      </div>
    ),

    tyre: (
      <div key="tyre" className="flex items-center justify-center">
        {tyre ? (
          <Tooltip content={`${tyre.compound?.toUpperCase()} compound · ${tyre.age ?? tyre.laps ?? 0} laps old`}>
            <div>
              <TyreIcon compound={tyre.compound} age={tyre.age ?? tyre.laps} compact={isCompact} />
            </div>
          </Tooltip>
        ) : (
          <span className="text-pitwall-ghost text-xs font-bold">—</span>
        )}
      </div>
    ),

    pit: (
      <div key="pit" className={`text-center font-mono ${timeSize} text-pitwall-dim font-bold`}>
        <motion.span
          animate={pitCountFlash ? { backgroundColor: ['rgba(232,0,45,0.3)', 'rgba(232,0,45,0)'] } : {}}
          transition={{ duration: 0.6 }}
          className={`px-1 rounded ${pitCount > 0 ? 'text-pitwall-text-strong font-bold' : 'text-pitwall-ghost'}`}
        >
          {pitCount}
        </motion.span>
      </div>
    ),

    // Own store subscription — see MomIndicator for why it is not a prop.
    mom: (
      <div key="mom" className="flex items-center justify-center">
        <MomIndicator driverNumber={driverNum} />
      </div>
    ),

    expand: (
      <div
        key="expand"
        className={`flex justify-center text-pitwall-ghost text-[10px] group-hover:text-pitwall-text-strong transition-transform duration-200 ${expanded ? 'rotate-180' : 'rotate-0'}`}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} driver details for ${code}`}
      >
        ▼
      </div>
    ),
  }

  return (
    <motion.div
      layout
      layoutId={`driver-row-${driverNum}`}
      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
      className={`driver-row group cursor-pointer transition-all duration-200 select-none relative overflow-hidden ${
        isBattling ? 'border-l-2 border-status-yellow bg-status-yellow/5' : ''
      }`}
      style={{
        boxShadow: rowShadow || undefined,
        backgroundColor: isPitting ? 'var(--pw-surface-2)' : undefined
      }}
      onClick={() => onExpand?.(driverNum)}
    >
      <div
        className={`grid items-center ${isCompact ? TOWER_ROW_HEIGHT.compact : TOWER_ROW_HEIGHT.comfortable} transition-colors ${rowBg}`}
        style={{ gridTemplateColumns: towerGridTemplate(columns) }}
      >
        {columns.map((col) => cells[col.key])}
      </div>

      {/* ── Expanded detail row ───────────────────────────────── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden border-b border-pitwall-border"
          >
            <div className="flex flex-wrap items-center gap-6 px-5 py-3 text-xs font-mono bg-pitwall-bg/40 border-t border-pitwall-border/50">
              <div className="flex items-center gap-2">
                <span className="text-pitwall-ghost font-display font-bold text-[10px] tracking-widest">BEST LAP:</span>
                <span className="font-bold timing-number text-pitwall-text-strong">
                  {bestLap != null ? formatLapTime(bestLap) : '—'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-pitwall-ghost font-display font-bold text-[10px] tracking-widest">BEST SECTORS:</span>
                <span className="font-bold timing-number text-pitwall-text-strong">
                  {[timing?.best_s1_time_in_s, timing?.best_s2_time_in_s, timing?.best_s3_time_in_s]
                    .map((v) => (v != null ? v.toFixed(3) : '—'))
                    .join(' / ')}
                </span>
              </div>
              {/* Speed traps — TimingData.Speeds, extracted but previously unused */}
              {(timing?.speed_i1 != null || timing?.speed_i2 != null || timing?.speed_trap != null) && (
                <div className="flex items-center gap-2 text-pitwall-dim">
                  <span className="text-pitwall-ghost font-display font-bold text-[10px] tracking-widest">SPEEDS:</span>
                  <span className="font-bold text-pitwall-text-strong timing-number">
                    {[
                      timing?.speed_i1 != null ? `I1 ${timing.speed_i1}` : null,
                      timing?.speed_i2 != null ? `I2 ${timing.speed_i2}` : null,
                      timing?.speed_trap != null ? `ST ${timing.speed_trap}` : null,
                    ].filter(Boolean).join(' · ')}
                    <span className="text-[9px] text-pitwall-ghost ml-1">KM/H</span>
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 text-pitwall-dim">
                <span className="text-pitwall-ghost font-display font-bold text-[10px] tracking-widest">PIT STOPS:</span>
                <span className="font-bold text-pitwall-text-strong timing-number px-1">{pitCount}</span>
              </div>
              {tyre && (
                <div className="flex items-center gap-2 text-pitwall-dim">
                  <span className="text-pitwall-ghost font-display font-bold text-[10px] tracking-widest">TYRE INFO:</span>
                  <span className="font-bold text-pitwall-text-strong timing-number">
                    {tyre.compound?.toUpperCase()} · {tyre.age ?? '—'} LAPS {(tyre.new_tyre ?? tyre.is_new) ? '(NEW)' : ''}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}, (prev, next) =>
  // Every field compared here is one the row RENDERS. Omitting a rendered field
  // means the row keeps a stale value until some other field happens to change
  // — which is how sector colours and knockout state used to go unnoticed.
  prev.mode                       === next.mode                       &&
  prev.timing?.position           === next.timing?.position           &&
  prev.timing?.last_lap_time_in_s === next.timing?.last_lap_time_in_s &&
  prev.timing?.best_lap_time_in_s === next.timing?.best_lap_time_in_s &&
  prev.timing?.best_lap_overall_fastest === next.timing?.best_lap_overall_fastest &&
  prev.timing?.gap_to_leader      === next.timing?.gap_to_leader      &&
  prev.timing?.gap_to_ahead       === next.timing?.gap_to_ahead       &&
  prev.timing?.quali_gap_to_leader === next.timing?.quali_gap_to_leader &&
  prev.timing?.quali_gap_to_ahead === next.timing?.quali_gap_to_ahead &&
  prev.timing?.s1_time_in_s       === next.timing?.s1_time_in_s       &&
  prev.timing?.s2_time_in_s       === next.timing?.s2_time_in_s       &&
  prev.timing?.s3_time_in_s       === next.timing?.s3_time_in_s       &&
  prev.timing?.s1_colour          === next.timing?.s1_colour          &&
  prev.timing?.s2_colour          === next.timing?.s2_colour          &&
  prev.timing?.s3_colour          === next.timing?.s3_colour          &&
  prev.timing?.best_s1_time_in_s  === next.timing?.best_s1_time_in_s  &&
  prev.timing?.best_s2_time_in_s  === next.timing?.best_s2_time_in_s  &&
  prev.timing?.best_s3_time_in_s  === next.timing?.best_s3_time_in_s  &&
  prev.timing?.overall_fastest    === next.timing?.overall_fastest    &&
  prev.timing?.personal_fastest   === next.timing?.personal_fastest   &&
  prev.timing?.pitting            === next.timing?.pitting            &&
  prev.timing?.in_pit             === next.timing?.in_pit             &&
  prev.timing?.pit_count          === next.timing?.pit_count          &&
  prev.timing?.retired            === next.timing?.retired            &&
  prev.timing?.stopped            === next.timing?.stopped            &&
  prev.timing?.knockout           === next.timing?.knockout           &&
  prev.timing?.cutoff             === next.timing?.cutoff             &&
  prev.timing?.last_lap_deleted   === next.timing?.last_lap_deleted   &&
  prev.timing?.speed_i1           === next.timing?.speed_i1           &&
  prev.timing?.speed_i2           === next.timing?.speed_i2           &&
  prev.timing?.speed_trap         === next.timing?.speed_trap         &&
  prev.tyre?.compound             === next.tyre?.compound             &&
  prev.tyre?.age                  === next.tyre?.age                  &&
  prev.tyre?.new_tyre             === next.tyre?.new_tyre             &&
  prev.tyre?.stint_number         === next.tyre?.stint_number         &&
  prev.tyre?.stints?.length       === next.tyre?.stints?.length       &&
  prev.penalty?.label             === next.penalty?.label             &&
  prev.teamColour                 === next.teamColour                 &&
  prev.teamTextColour             === next.teamTextColour             &&
  prev.isFavourite                === next.isFavourite                &&
  prev.isBattling                 === next.isBattling                 &&
  prev.expanded                   === next.expanded
)

export default DriverRow
