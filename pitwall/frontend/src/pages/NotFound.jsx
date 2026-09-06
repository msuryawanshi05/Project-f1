import { useNavigate } from 'react-router-dom'

/**
 * NotFoundPage — 404 route fallback.
 * Shown when user navigates to a path that doesn't exist.
 */
export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-[calc(100vh-120px)] flex flex-col items-center justify-center gap-4 px-6 select-none" style={{ background: 'var(--pw-bg)' }}>
      {/* Large 404 */}
      <div
        className="font-display font-black text-[120px] md:text-[180px] leading-none tracking-tight"
        style={{ color: 'var(--pw-border)' }}
        aria-hidden="true"
      >
        404
      </div>

      {/* Heading */}
      <h1 className="font-display font-bold text-xl md:text-2xl tracking-widest uppercase text-pitwall-text-strong text-center">
        Page Not Found
      </h1>

      {/* Tagline */}
      <p className="font-body text-sm text-pitwall-dim text-center max-w-xs">
        This lap doesn&apos;t exist on the circuit. Maybe the route was retired?
      </p>

      {/* Back button */}
      <button
        onClick={() => navigate('/')}
        className="mt-4 px-6 py-2.5 bg-status-red text-white font-display font-bold text-xs tracking-widest uppercase rounded-sm transition-opacity hover:opacity-85 active:scale-[0.97]"
      >
        Back to Home
      </button>

      {/* Decorative */}
      <div className="mt-8 font-mono text-[10px] text-pitwall-ghost/30 tracking-widest uppercase">
        PITWALL · RACE CONTROL
      </div>
    </div>
  )
}
