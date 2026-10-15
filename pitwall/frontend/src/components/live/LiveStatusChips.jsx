import { useEffect, useRef, useState } from 'react'
import useF1Store from '../../store/useF1Store'
import useWakeLock from '../../hooks/useWakeLock'

/**
 * The two things worth knowing at a glance during a race, in the Live header.
 *
 * Both are small and permanent rather than transient, because the question
 * they answer is asked at unpredictable moments: "is my data still lined up
 * with the TV" and "is this screen going to dim on me".
 */

/**
 * Current broadcast sync offset, always visible.
 *
 * The [ and ] keys change it from anywhere on the Live tab, and a slider in
 * Settings sets the same value — so the number has to be on screen, or there
 * is no way to tell what the keys did.
 */
export function SyncChip() {
  const delay = useF1Store((s) => s.settings.syncDelaySeconds ?? 0)
  const [flash, setFlash] = useState(null)
  const timer = useRef(null)

  // The keyboard handler calls this; it has no React context of its own.
  useEffect(() => {
    window.__pitwall_syncToast = (value) => {
      setFlash(value)
      clearTimeout(timer.current)
      // Long enough to read mid-race, short enough to stop being in the way.
      timer.current = setTimeout(() => setFlash(null), 1600)
    }
    return () => {
      delete window.__pitwall_syncToast
      clearTimeout(timer.current)
    }
  }, [])

  const live = flash ?? delay
  const label = live === 0 ? 'SYNC 0' : `SYNC +${live.toFixed(1)}s`

  return (
    <div
      role="status"
      aria-label={`Broadcast sync delay ${live} seconds`}
      title="Broadcast sync delay. [ and ] adjust it by half a second."
      data-sync-delay={live}
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm border"
      style={{
        // The only state change: a brief border while the value is settling,
        // then back. No movement, no size change — this sits beside a timing
        // tower being read at a glance.
        borderColor: flash != null ? 'var(--pw-text-strong)' : 'var(--pw-border)',
        background: 'var(--pw-surface)',
      }}
    >
      <span
        className="font-mono text-[10px] tabular-nums tracking-wider"
        style={{ color: flash != null ? 'var(--pw-text-strong)' : live > 0 ? 'var(--pw-dim)' : 'var(--pw-ghost)' }}
      >
        {label}
      </span>
    </div>
  )
}

/**
 * Whether the screen is being held awake.
 *
 * Only shown when a session is running and the browser supports it. Absent
 * elsewhere rather than showing a dead indicator: a chip that says "off" all
 * week is noise.
 */
export function WakeLockChip({ active }) {
  const { supported, held } = useWakeLock(active)
  if (!supported || !active) return null

  return (
    <div
      role="status"
      aria-label={held ? 'Screen kept awake' : 'Screen not kept awake'}
      title={held
        ? 'Holding a screen wake lock — this display will not dim or lock while the session runs.'
        : 'The browser declined the wake lock. The screen may dim; your system power settings still apply.'}
      data-wake-lock={held ? 'held' : 'denied'}
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm border"
      style={{ borderColor: 'var(--pw-border)', background: 'var(--pw-surface)' }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: held ? '#00C853' : 'var(--pw-ghost)', opacity: held ? 1 : 0.5 }}
        aria-hidden="true"
      />
      <span className="font-mono text-[10px] tracking-wider" style={{ color: 'var(--pw-ghost)' }}>
        AWAKE
      </span>
    </div>
  )
}
