import { memo, useRef, useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import TyreIcon from './TyreIcon'
import SectorTime from './SectorTime'
import { formatLapTime, formatGap, getSegmentColour, resolveDriverCode, resolveDriver } from '../../utils/driverUtils'
import { useFlashOnChange } from '../../hooks/useFlashOnChange'
import { Tooltip } from './Tooltip'
import useF1Store from '../../store/useF1Store'
import teamsData from '../../data/teams.json'

const DriverRow = memo(function DriverRow({
  driver,
  timing,
  tyre,
  teamColour = '#444444',
  isFavourite = false,
  expanded = false,
  onExpand,
  isBattling = false,
  showSidebar = true,
  penalty = null,
}) {
  const density = useF1Store((s) => s.settings.density)
  const isCompact = density === 'compact'
  const driverNum = driver?.number ?? timing?.driver_number

  const colWidths = {
    pos: 'w-[6%] min-w-[28px]',
    drv: 'w-[13%] min-w-[66px] pl-1',
    gap: 'w-[13%] min-w-[62px]',
    lastLap: 'w-[14%] min-w-[70px]',
    s1: 'w-[11%] min-w-[52px] text-center',
    s2: 'w-[11%] min-w-[52px] text-center',
    s3: 'w-[11%] min-w-[52px] text-center',
    tyre: 'w-[8%] min-w-[36px] text-center',
    pit: 'w-[5%] min-w-[22px] text-center',
    expand: 'w-[5%] min-w-[20px]',
  }

  const resolved = resolveDriver(driverNum, [])
  const code = (driver?.code && isNaN(Number(driver.code))) 
    ? driver.code 
    : (resolved?.code ?? resolveDriverCode(driverNum, []))
  const pos       = timing?.position ?? driver?.position ?? '—'
  const gap       = formatGap(timing?.gap_to_leader ?? timing?.gap, pos)
  // Use direct field; if null, try summing sector times as fallback
  const lastLap = useMemo(() => {
    if (timing?.last_lap_time_in_s != null) return timing.last_lap_time_in_s
    const s1 = timing?.s1_time_in_s
    const s2 = timing?.s2_time_in_s
    const s3 = timing?.s3_time_in_s
    if (s1 != null && s2 != null && s3 != null) return s1 + s2 + s3
    return null
  }, [timing?.last_lap_time_in_s, timing?.s1_time_in_s, timing?.s2_time_in_s, timing?.s3_time_in_s])
  const isPitting = timing?.pitting ?? false
  const isSC      = timing?.status === 'SC'
  const lapDeleted= timing?.last_lap_deleted ?? false
  const isFastestLap = timing?.overall_fastest ?? false
  const isRetired = timing?.stopped === true
  const isOutOfRace = isRetired || timing?.knockout === true

  // Derive completed pit stop count from timing or tyre stints (stint 1 = 0 stops, stint 2 = 1 stop, etc.)
  const pitCount = useMemo(() => {
    if (timing?.pit_count != null && !isNaN(Number(timing.pit_count))) {
      return Number(timing.pit_count)
    }
    if (timing?.number_of_pit_stops != null && !isNaN(Number(timing.number_of_pit_stops))) {
      return Number(timing.number_of_pit_stops)
    }
    if (timing?.pits != null && !isNaN(Number(timing.pits))) {
      return Number(timing.pits)
    }
    if (tyre?.stint_number != null && tyre.stint_number > 0) {
      return Math.max(0, tyre.stint_number - 1)
    }
    if (Array.isArray(tyre?.stints) && tyre.stints.length > 0) {
      return Math.max(0, tyre.stints.length - 1)
    }
    return 0
  }, [timing?.pit_count, timing?.number_of_pit_stops, timing?.pits, tyre?.stint_number, tyre?.stints])

  const s1Col = timing?.s1_colour ?? timing?.best_sector_1_colour ?? null
  const s2Col = timing?.s2_colour ?? timing?.best_sector_2_colour ?? null
  const s3Col = timing?.s3_colour ?? timing?.best_sector_3_colour ?? null
  const s1Code= typeof s1Col === 'number' ? getSegmentColour(s1Col) : (s1Col ?? 'white')
  const s2Code= typeof s2Col === 'number' ? getSegmentColour(s2Col) : (s2Col ?? 'white')
  const s3Code= typeof s3Col === 'number' ? getSegmentColour(s3Col) : (s3Col ?? 'white')

  const lapColour = timing?.overall_fastest ? 'purple'
    : timing?.personal_fastest ? 'green'
    : 'yellow'

  const positionFlash = useFlashOnChange(pos)
  const gapFlash = useFlashOnChange(timing?.gap_to_leader ?? timing?.gap)
  const lapFlash = useFlashOnChange(lastLap)
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
      <div className={`flex items-center ${isCompact ? 'h-8' : 'h-10'} gap-0 transition-colors ${rowBg}`}>
        <div className="w-[4px] h-full self-stretch" style={{ backgroundColor: teamColour }} />

        <div className={`${colWidths.pos} flex-shrink-0 text-center font-display font-extrabold ${isCompact ? 'text-xs' : 'text-sm'} text-pitwall-text-strong pl-1 italic relative flex items-center justify-center transition-all duration-300`}>
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
              className={`absolute right-[1px] text-[8px] font-bold ${
                direction === 'up' ? 'text-status-green' : 'text-status-red'
              }`}
            >
              {direction === 'up' ? '▲' : '▼'}
            </motion.span>
          )}
        </div>

        <div className={`${colWidths.drv} flex-shrink-0 flex items-center font-display font-extrabold ${isCompact ? 'text-xs' : 'text-[14px]'} uppercase pl-1 transition-all duration-300`} style={{ color: teamColour }}>
          {penalty && (
            <Tooltip content={penalty.message || `Penalty: ${penalty.label}`}>
              <span className="inline-flex items-center justify-center font-mono font-black text-[9px] px-1 py-0.5 rounded leading-none flex-shrink-0 bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm animate-pulse mr-1">
                <span className="mr-0.5 text-[8px]">⚠️</span>
                {penalty.label}
              </span>
            </Tooltip>
          )}
          <Tooltip content={resolved?.name || `${driver?.givenName ?? ''} ${driver?.familyName ?? ''}`.trim() || `Driver #${driverNum}`}>
            <span className={`tracking-wider ${isOutOfRace ? 'line-through text-pitwall-dim' : ''}`}>{code}</span>
          </Tooltip>
        </div>

        <div className={`${colWidths.gap} flex-shrink-0 font-mono ${isCompact ? 'text-[11px]' : 'text-xs'} text-pitwall-dim truncate transition-all duration-300`}>
          {isOutOfRace ? (
            <span className="text-red-400 font-bold px-1.5 py-0.5 bg-red-900/20 border border-red-800/30 rounded-sm text-[10px] tracking-wider font-display">RETIRED</span>
          ) : isPitting ? (
            <span className="text-status-yellow font-bold px-1.5 py-0.5 bg-status-yellow/10 border border-status-yellow/20 rounded-sm text-[10px] tracking-wider display-font">PIT IN</span>
          ) : isSC ? (
            <span className="text-status-yellow font-bold px-1.5 py-0.5 bg-status-yellow/10 border border-status-yellow/20 rounded-sm text-[10px] tracking-wider display-font">SC</span>
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

        <div className={`${colWidths.lastLap} flex-shrink-0 timing-number font-bold ${isCompact ? 'text-[11px]' : 'text-xs'} ${
          lapColour === 'purple' ? 'sector-purple' : lapColour === 'green' ? 'sector-green' : 'sector-yellow'
        } ${lapDeleted ? 'lap-deleted' : ''} transition-all duration-300`}>
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

        <div className={`${colWidths.s1} flex-shrink-0 flex items-center justify-center transition-all duration-300`}>
          <SectorTime seconds={timing?.s1_time_in_s ?? timing?.sector_1?.time ?? timing?.best_sector_1_time} colourClass={s1Code} />
        </div>
        <div className={`${colWidths.s2} flex-shrink-0 flex items-center justify-center transition-all duration-300`}>
          <SectorTime seconds={timing?.s2_time_in_s ?? timing?.sector_2?.time ?? timing?.best_sector_2_time} colourClass={s2Code} />
        </div>
        <div className={`${colWidths.s3} flex-shrink-0 flex items-center justify-center transition-all duration-300`}>
          <SectorTime seconds={timing?.s3_time_in_s ?? timing?.sector_3?.time ?? timing?.best_sector_3_time} colourClass={s3Code} />
        </div>

        <div className={`${colWidths.tyre} flex-shrink-0 flex items-center justify-center transition-all duration-300`}>
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

        <div className={`${colWidths.pit} flex-shrink-0 text-center font-mono ${isCompact ? 'text-[11px]' : 'text-xs'} text-pitwall-dim font-bold transition-all duration-300`}>
          <motion.span
            animate={pitCountFlash ? { backgroundColor: ['rgba(232,0,45,0.3)', 'rgba(232,0,45,0)'] } : {}}
            transition={{ duration: 0.6 }}
            className={`px-1 rounded ${pitCount > 0 ? 'text-pitwall-text-strong font-bold' : 'text-pitwall-ghost'}`}
          >
            {pitCount}
          </motion.span>
        </div>

        <div 
          className={`${colWidths.expand} flex justify-center ml-auto pr-3 text-pitwall-ghost text-[10px] group-hover:text-pitwall-text-strong transition-all duration-200 transform ${expanded ? 'rotate-180' : 'rotate-0'}`}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} driver details for ${code}`}
        >
          ▼
        </div>
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
                <span className="text-pitwall-ghost font-display font-bold text-[10px] tracking-widest">SECTOR 1:</span>
                <SectorTime seconds={timing?.s1_time_in_s} colourClass={s1Code} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-pitwall-ghost font-display font-bold text-[10px] tracking-widest">SECTOR 2:</span>
                <SectorTime seconds={timing?.s2_time_in_s} colourClass={s2Code} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-pitwall-ghost font-display font-bold text-[10px] tracking-widest">SECTOR 3:</span>
                <SectorTime seconds={timing?.s3_time_in_s} colourClass={s3Code} />
              </div>
              {timing?.speed_trap && (
                <div className="flex items-center gap-2 text-pitwall-dim">
                  <span className="text-pitwall-ghost font-display font-bold text-[10px] tracking-widest">SPEED TRAP:</span>
                  <span className="font-bold text-pitwall-text-strong timing-number">{timing.speed_trap} <span className="text-[9px] text-pitwall-ghost">KM/H</span></span>
                </div>
              )}
              <div className="flex items-center gap-2 text-pitwall-dim">
                <span className="text-pitwall-ghost font-display font-bold text-[10px] tracking-widest">PIT STOPS:</span>
                <motion.span
                  animate={pitCountFlash ? { backgroundColor: ['rgba(232,0,45,0.3)', 'rgba(232,0,45,0)'] } : {}}
                  transition={{ duration: 0.6 }}
                  className="font-bold text-pitwall-text-strong timing-number px-1 rounded"
                >
                  {pitCount}
                </motion.span>
              </div>
              {tyre && (
                <div className="flex items-center gap-2 text-pitwall-dim">
                  <span className="text-pitwall-ghost font-display font-bold text-[10px] tracking-widest">TYRE INFO:</span>
                  <span className="font-bold text-pitwall-text-strong timing-number">{tyre.compound?.toUpperCase()} · {tyre.age ?? '—'} LAPS {tyre.is_new ? '(NEW)' : ''}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}, (prev, next) =>
  prev.timing?.last_lap_time_in_s === next.timing?.last_lap_time_in_s &&
  prev.timing?.position           === next.timing?.position           &&
  prev.timing?.gap_to_leader      === next.timing?.gap_to_leader      &&
  prev.timing?.pitting            === next.timing?.pitting            &&
  prev.timing?.pit_count          === next.timing?.pit_count          &&
  prev.timing?.s1_time_in_s       === next.timing?.s1_time_in_s       &&
  prev.timing?.s2_time_in_s       === next.timing?.s2_time_in_s       &&
  prev.timing?.s3_time_in_s       === next.timing?.s3_time_in_s       &&
  prev.timing?.sector_1?.time     === next.timing?.sector_1?.time     &&
  prev.timing?.sector_2?.time     === next.timing?.sector_2?.time     &&
  prev.timing?.sector_3?.time     === next.timing?.sector_3?.time     &&
  prev.timing?.overall_fastest    === next.timing?.overall_fastest    &&
  prev.timing?.stopped            === next.timing?.stopped            &&
  prev.timing?.deleted_lap        === next.timing?.deleted_lap        &&
  prev.tyre?.compound             === next.tyre?.compound             &&
  prev.tyre?.age                  === next.tyre?.age                  &&
  prev.tyre?.stint_number         === next.tyre?.stint_number         &&
  prev.tyre?.stints?.length       === next.tyre?.stints?.length       &&
  prev.penalty?.label             === next.penalty?.label             &&
  prev.teamColour                 === next.teamColour                 &&
  prev.isFavourite                === next.isFavourite                &&
  prev.isBattling                 === next.isBattling                 &&
  prev.expanded                   === next.expanded
)

export default DriverRow
