const COMPOUND_CONFIG = {
  SOFT:   { bg: '#E8002D', text: '#fff', letter: 'S' },
  MEDIUM: { bg: '#FFF200', text: '#000', letter: 'M' },
  HARD:   { bg: '#FFFFFF', text: '#000', letter: 'H' },
  INTER:  { bg: '#39B54A', text: '#fff', letter: 'I' },
  WET:    { bg: '#0067FF', text: '#fff', letter: 'W' },
}

/**
 * TyreIcon — compound coloured circle with letter + age below
 * Props: compound ("SOFT"|"MEDIUM"|...), age (laps as number)
 */
export default function TyreIcon({ compound, age }) {
  const cfg = COMPOUND_CONFIG[compound?.toUpperCase()] ?? { bg: '#444', text: '#fff', letter: '?' }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center font-display font-bold text-xs"
        style={{ backgroundColor: cfg.bg, color: cfg.text }}
        title={compound}
      >
        {cfg.letter}
      </div>
      {age != null && (
        <span className="font-mono text-[9px] text-pitwall-dim leading-none">
          {age}
        </span>
      )}
    </div>
  )
}
