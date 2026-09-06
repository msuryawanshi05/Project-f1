import { memo } from 'react'

const COMPOUND_CONFIG = {
  SOFT:         { bg: 'var(--pw-red)', text: '#FFFFFF', letter: 'S' },
  MEDIUM:       { bg: 'var(--pw-tyre-medium)', text: '#000000', letter: 'M' },
  HARD:         { bg: 'var(--pw-tyre-hard)', text: '#000000', letter: 'H' },
  INTERMEDIATE: { bg: '#00A651', text: '#FFFFFF', letter: 'I' },
  INTER:        { bg: '#00A651', text: '#FFFFFF', letter: 'I' },
  WET:          { bg: '#0067FF', text: '#FFFFFF', letter: 'W' },
  UNKNOWN:      { bg: 'transparent', text: 'var(--pw-ghost)', letter: '—' },
}

/**
 * TyreIcon — compound coloured circle with letter + age below
 * Props: compound ("SOFT"|"MEDIUM"|...), age (laps as number), compact (boolean)
 */
const TyreIcon = memo(function TyreIcon({ compound, age, compact = false }) {
  const normCompound = compound?.toUpperCase() ?? ''
  const cfg = COMPOUND_CONFIG[normCompound] ?? { bg: '#555555', text: '#FFFFFF', letter: '?' }

  const ageLabel = age != null ? `, ${age} laps old` : ''
  const ariaLabel = `${compound ?? 'Unknown'} compound${ageLabel}`

  if (compact) {
    return (
      <div
        role="img"
        aria-label={ariaLabel}
        className="flex items-center gap-1.5 select-none leading-none"
      >
        <div
          className="w-[18px] h-[18px] rounded-full flex items-center justify-center font-display font-black text-[9px] shadow-sm flex-shrink-0"
          style={{ 
            backgroundColor: cfg.bg, 
            color: cfg.text,
            boxShadow: `0 0 6px ${cfg.bg}25` 
          }}
          title={compound}
          aria-hidden="true"
        >
          {cfg.letter}
        </div>
        {age != null && (
          <span className="font-mono text-[9.5px] text-pitwall-ghost font-bold" aria-hidden="true">
            {age}L
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="flex flex-col items-center gap-0.5 select-none"
    >
      <div
        className="w-[22px] h-[22px] rounded-full flex items-center justify-center font-display font-black text-[11px] shadow-sm"
        style={{ 
          backgroundColor: cfg.bg, 
          color: cfg.text,
          boxShadow: `0 0 8px ${cfg.bg}25` 
        }}
        title={compound}
        aria-hidden="true"
      >
        {cfg.letter}
      </div>
      {age != null && (
        <span className="font-mono text-[9px] text-pitwall-ghost leading-none font-medium mt-0.5" aria-hidden="true">
          {age}L
        </span>
      )}
    </div>
  )
})

export default TyreIcon
