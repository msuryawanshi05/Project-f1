import { memo } from 'react'

// ── Generic skeleton line ─────────────────────────────────────────────────────
export const SkeletonLine = memo(function SkeletonLine({ width = 'w-full', height = 'h-3' }) {
  return <div className={`${width} ${height} bg-[#1a1a1a] rounded animate-pulse`} />
})

// ── Empty state with icon ─────────────────────────────────────────────────────
export function EmptyState({ icon, title, message, className = "max-w-lg mx-auto my-12" }) {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-pitwall-border bg-pitwall-surface/40 rounded-sm gap-3 backdrop-blur-[1px] ${className}`}>
      {icon && <span className="text-3xl mb-1 filter drop-shadow-md select-none" role="img" aria-hidden="true">{icon}</span>}
      <h3 className="font-display text-sm font-bold tracking-widest text-pitwall-text-strong uppercase">{title}</h3>
      {message && (
        <p className="font-mono text-xs text-pitwall-dim max-w-xs leading-relaxed">
          {message}
        </p>
      )}
    </div>
  )
}
