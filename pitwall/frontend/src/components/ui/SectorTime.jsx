import { memo } from 'react'

/**
 * SectorTime — single sector time with colour class
 * Props: seconds (number|null), colourClass ("purple"|"green"|"yellow"|"white")
 */
const SectorTime = memo(function SectorTime({ seconds, colourClass = 'white' }) {
  let display = '--.---'
  if (seconds != null && seconds !== '') {
    const num = parseFloat(seconds)
    if (!isNaN(num) && num > 0) {
      display = num.toFixed(3)
    }
  }

  const cls = (colourClass && colourClass !== 'white') ? `sector-${colourClass}` : 'sector-white'

  // F1 timing broadcast styled container boxes.
  // `pit` is segment status 2064 — in the pit lane, not competitively timed —
  // and is deliberately styled neutrally so it never reads as a pace colour.
  const bgMap = {
    purple: 'bg-sector-purple/15 border border-sector-purple/40 shadow-sm shadow-sector-purple/10',
    green:  'bg-sector-green/15 border border-sector-green/40 shadow-sm shadow-sector-green/10',
    yellow: 'bg-sector-yellow/10 border border-sector-yellow/30',
    pit:    'border border-dashed border-pitwall-border',
    white:  'border border-transparent'
  }
  const containerCls = bgMap[colourClass] ?? bgMap.white

  return (
    // w-full fills the grid track from layoutConstants (minmax(76px, auto)),
    // which is sized to hold "47.294" in full. whitespace-nowrap + no overflow
    // clipping means a sector time is never truncated to 2dp.
    <span className={`${containerCls} inline-flex items-center justify-center w-full px-1 py-0.5 rounded-sm text-center whitespace-nowrap`}>
      <span className={`timing-number text-[11px] font-medium ${cls}`}>
        {display}
      </span>
    </span>
  )
})

export default SectorTime
