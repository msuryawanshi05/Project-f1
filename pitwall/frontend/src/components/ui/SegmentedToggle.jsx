import { memo } from 'react'

/**
 * SegmentedToggle — the Drivers | Constructors switch.
 *
 * Extracted from Standings so the Drivers page uses the same control rather
 * than a second lookalike. One implementation means one set of states to keep
 * consistent (selected, hover, focus, disabled) and one place to fix them.
 *
 * Rendered as a radiogroup: a segmented control is a single-choice input, so
 * arrow keys move between options and only the selected option is in the tab
 * order. A row of plain buttons gives screen-reader users no indication the
 * options are related or that one is already chosen.
 */
const SegmentedToggle = memo(function SegmentedToggle({
  options,
  value,
  onChange,
  ariaLabel = 'View',
  size = 'md',
}) {
  const pad = size === 'sm' ? 'px-3 py-1' : 'px-4 py-1.5'
  const text = size === 'sm' ? 'text-[11px]' : 'text-xs'

  const move = (dir) => {
    const i = options.findIndex((o) => (o.value ?? o) === value)
    if (i < 0) return
    const next = options[(i + dir + options.length) % options.length]
    onChange(next.value ?? next)
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex items-center bg-pitwall-surface-2 p-0.5 rounded border border-pitwall-border"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(1) }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
      }}
    >
      {options.map((opt) => {
        const val = opt.value ?? opt
        const label = opt.label ?? opt
        const selected = value === val
        return (
          <button
            key={val}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(val)}
            className={`${pad} font-display ${text} tracking-widest uppercase transition-all font-bold rounded-sm whitespace-nowrap ${
              selected
                ? 'bg-status-red text-white shadow-sm shadow-status-red/20'
                : 'text-pitwall-ghost hover:text-pitwall-text-strong'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
})

export default SegmentedToggle
