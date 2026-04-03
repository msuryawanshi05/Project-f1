import { memo } from 'react'

// ── Generic skeleton line ─────────────────────────────────────────────────────
export const SkeletonLine = memo(function SkeletonLine({ width = 'w-full', height = 'h-3' }) {
  return <div className={`${width} ${height} bg-[#1a1a1a] rounded animate-pulse`} />
})

// ── Empty state with icon ─────────────────────────────────────────────────────
export function EmptyState({ icon, title, message }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center text-pitwall-ghost gap-3">
      <span className="text-4xl" role="img" aria-hidden="true">{icon}</span>
      <p className="font-display text-base text-pitwall-dim">{title}</p>
      {message && <p className="font-mono text-xs max-w-xs leading-relaxed">{message}</p>}
    </div>
  )
}
