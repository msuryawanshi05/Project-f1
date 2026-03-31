import { memo } from 'react'

/**
 * SectorTime — single sector time with colour class
 * Props: seconds (number|null), colourClass ("purple"|"green"|"yellow"|"white")
 */
const SectorTime = memo(function SectorTime({ seconds, colourClass = 'white' }) {
  const display = seconds == null || isNaN(seconds)
    ? '--.---'
    : Number(seconds).toFixed(3)

  const cls = `sector-${colourClass}`

  return (
    <span className={`timing-number ${cls}`}>
      {display}
    </span>
  )
})

export default SectorTime
