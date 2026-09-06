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

  // F1 timing broadcast styled container boxes
  const bgMap = {
    purple: 'bg-sector-purple/15 border border-sector-purple/40 shadow-sm shadow-sector-purple/10',
    green:  'bg-sector-green/15 border border-sector-green/40 shadow-sm shadow-sector-green/10',
    yellow: 'bg-sector-yellow/10 border border-sector-yellow/30',
    white:  'border border-transparent'
  }
  const containerCls = bgMap[colourClass] ?? bgMap.white

  return (
    <span className={`${containerCls} inline-flex items-center justify-center px-1 py-0.5 rounded-sm min-w-[50px] text-center whitespace-nowrap overflow-visible`}>
      <span className={`timing-number font-mono text-[11px] font-medium ${cls}`}>
        {display}
      </span>
    </span>
  )
})

export default SectorTime
