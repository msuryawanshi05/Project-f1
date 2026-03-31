import { useState, memo } from 'react'

import TyreIcon from './TyreIcon'
import SectorTime from './SectorTime'
import { formatLapTime, formatGap, getSegmentColour } from '../../utils/driverUtils'

const FLAG_MAP = {
  Netherlands: '🇳🇱', British: '🇬🇧', 'United Kingdom': '🇬🇧',
  Monégasque: '🇲🇨', Monaco: '🇲🇨', Spanish: '🇪🇸', Spain: '🇪🇸',
  German: '🇩🇪', Germany: '🇩🇪', Finnish: '🇫🇮', Finland: '🇫🇮',
  Australian: '🇦🇺', Australia: '🇦🇺', Canadian: '🇨🇦', Canada: '🇨🇦',
  Mexican: '🇲🇽', Mexico: '🇲🇽', Japanese: '🇯🇵', Japan: '🇯🇵',
  Thai: '🇹🇭', Thailand: '🇹🇭', Danish: '🇩🇰', Denmark: '🇩🇰',
  American: '🇺🇸', Chinese: '🇨🇳', French: '🇫🇷', Argentine: '🇦🇷',
  Brazilian: '🇧🇷', Italian: '🇮🇹', Azerbaijani: '🇦🇿',
}

function getFlagEmoji(nationality) {
  return FLAG_MAP[nationality] ?? '🏁'
}

/**
 * DriverRow — the main reusable timing row component
 *
 * Props:
 *   driver      – driver object from store (number, code, full_name, nationality, team)
 *   timing      – timing object for this driver (position, gap, last_lap, s1, s2, s3, ...)
 *   tyre        – tyre object (compound, age, is_new)
 *   teamColour  – hex string for left bar
 *   isFavourite – bool, glows team colour border
 *   rank        – overall position (1-based)
 */
const DriverRow = memo(function DriverRow({ driver, timing, tyre, teamColour = '#444444', isFavourite = false }) {
  const [expanded, setExpanded] = useState(false)

  const code      = driver?.short_name ?? driver?.code ?? driver?.number ?? '???'
  const flag      = getFlagEmoji(driver?.nationality ?? '')
  const pos       = timing?.position ?? driver?.position ?? '—'
  const gap       = formatGap(timing?.gap_to_leader ?? timing?.gap)
  const lastLap   = timing?.last_lap_time_in_s ?? null
  const isPitting = timing?.pitting ?? false
  const isSC      = timing?.status === 'SC'
  const lapDeleted= timing?.last_lap_deleted ?? false

  // Sector colour classes from segment_colours array [s1, s2, s3]
  const s1Col = timing?.s1_colour ?? timing?.best_sector_1_colour ?? null
  const s2Col = timing?.s2_colour ?? timing?.best_sector_2_colour ?? null
  const s3Col = timing?.s3_colour ?? timing?.best_sector_3_colour ?? null
  const s1Code= typeof s1Col === 'number' ? getSegmentColour(s1Col) : (s1Col ?? 'white')
  const s2Code= typeof s2Col === 'number' ? getSegmentColour(s2Col) : (s2Col ?? 'white')
  const s3Code= typeof s3Col === 'number' ? getSegmentColour(s3Col) : (s3Col ?? 'white')

  // Overall lap colour
  const lapColour = timing?.personal_fastest ? 'green'
    : timing?.overall_fastest ? 'purple'
    : 'yellow'

  const rowBg = isPitting ? 'bg-[#1a1a1a]' : 'bg-pitwall-surface hover:bg-[#161616]'
  const favRing = isFavourite ? `ring-1 ring-inset` : ''
  const favStyle = isFavourite ? { '--tw-ring-color': teamColour } : {}

  return (
    <div
      className={`driver-row group cursor-pointer transition-colors ${rowBg} ${favRing}`}
      style={isFavourite ? { boxShadow: `inset 2px 0 0 ${teamColour}` } : {}}
      onClick={() => setExpanded((e) => !e)}
    >
      {/* ── Main row ─────────────────────────────────────────── */}
      <div className="flex items-center h-9 gap-0" style={{ borderBottom: '1px solid #1a1a1a' }}>
        {/* Team colour bar */}
        <div className="team-bar h-full" style={{ backgroundColor: teamColour }} />

        {/* POS */}
        <div className="w-10 flex-shrink-0 text-center font-mono text-[13px] text-pitwall-text pl-2">
          {pos}
        </div>

        {/* FLAG */}
        <div className="w-7 flex-shrink-0 text-center text-sm">
          {flag}
        </div>

        {/* CODE */}
        <div className="w-14 flex-shrink-0 font-mono font-medium text-[13px] text-white">
          {code}
        </div>

        {/* STATUS / GAP */}
        <div className="w-20 flex-shrink-0 font-mono text-xs text-pitwall-dim truncate">
          {isPitting ? (
            <span className="text-status-yellow">PIT IN</span>
          ) : isSC ? (
            <span className="text-status-sc">SC</span>
          ) : (
            gap
          )}
        </div>

        {/* LAST LAP */}
        <div className={`w-24 flex-shrink-0 timing-number ${lapColour === 'purple' ? 'sector-purple' : lapColour === 'green' ? 'sector-green' : 'sector-yellow'} ${lapDeleted ? 'lap-deleted' : ''}`}>
          {isPitting ? '—:——.———' : formatLapTime(lastLap)}
        </div>

        {/* S1 S2 S3 */}
        <div className="w-16 flex-shrink-0">
          <SectorTime seconds={timing?.s1_time_in_s ?? timing?.best_sector_1_time} colourClass={s1Code} />
        </div>
        <div className="w-16 flex-shrink-0">
          <SectorTime seconds={timing?.s2_time_in_s ?? timing?.best_sector_2_time} colourClass={s2Code} />
        </div>
        <div className="w-16 flex-shrink-0">
          <SectorTime seconds={timing?.s3_time_in_s ?? timing?.best_sector_3_time} colourClass={s3Code} />
        </div>

        {/* TYRE */}
        <div className="w-12 flex-shrink-0 flex items-center justify-center">
          {tyre ? (
            <TyreIcon compound={tyre.compound} age={tyre.age ?? tyre.laps} />
          ) : (
            <span className="text-pitwall-ghost text-xs">—</span>
          )}
        </div>

        {/* STOPS */}
        <div className="w-8 flex-shrink-0 text-center font-mono text-xs text-pitwall-ghost">
          {timing?.pit_count ?? '—'}
        </div>

        {/* Expand chevron */}
        <div className="ml-auto pr-2 text-pitwall-ghost text-xs group-hover:text-pitwall-dim transition-colors">
          {expanded ? '▲' : '▼'}
        </div>
      </div>

      {/* ── Expanded detail row ───────────────────────────────── */}
      {expanded && (
        <div
          className="flex items-center gap-6 px-4 py-2 bg-[#0d0d0d] text-xs font-mono"
          style={{ borderBottom: '1px solid #1a1a1a' }}
        >
          <div className="flex gap-4">
            <span className="text-pitwall-ghost">S1:</span>
            <SectorTime seconds={timing?.s1_time_in_s} colourClass={s1Code} />
          </div>
          <div className="flex gap-4">
            <span className="text-pitwall-ghost">S2:</span>
            <SectorTime seconds={timing?.s2_time_in_s} colourClass={s2Code} />
          </div>
          <div className="flex gap-4">
            <span className="text-pitwall-ghost">S3:</span>
            <SectorTime seconds={timing?.s3_time_in_s} colourClass={s3Code} />
          </div>
          {timing?.speed_trap && (
            <div className="flex gap-1 text-pitwall-dim">
              <span className="text-pitwall-ghost">Speed:</span>
              <span>{timing.speed_trap} km/h</span>
            </div>
          )}
          <div className="flex gap-1 text-pitwall-dim">
            <span className="text-pitwall-ghost">Stops:</span>
            <span>{timing?.pit_count ?? '—'}</span>
          </div>
          {tyre && (
            <div className="flex gap-1 text-pitwall-dim">
              <span className="text-pitwall-ghost">On:</span>
              <span>{tyre.compound} {tyre.age ?? '—'} laps{tyre.is_new ? ' (new)' : ''}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
})

export default DriverRow
