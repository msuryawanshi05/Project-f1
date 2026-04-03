import { useEffect, useRef, memo, useState } from 'react'
import useF1Store from '../../store/useF1Store'

// ── Notification type config ──────────────────────────────────────────────────
const TYPE_COLOURS = {
  critical: '#E8002D',
  high:     '#FF6B00',
  medium:   '#B468FF',
  info:     '#888888',
  blue:     '#3671C6',
  teal:     '#00D2BE',
}

const DISMISS_MS = 6000   // 6s so live pit-stop timers have room

// ── Single notification card ──────────────────────────────────────────────────
const NotificationCard = memo(function NotificationCard({ notification, onDismiss }) {
  const colour      = TYPE_COLOURS[notification.type] ?? TYPE_COLOURS.info
  const progressRef = useRef(null)
  const [elapsed, setElapsed] = useState(0)        // for live pit-stop counter
  const startRealTime = useRef(Date.now())

  // CSS progress bar countdown — only for non-live cards
  useEffect(() => {
    if (notification.live) return    // don't animate progress bar while live
    const el = progressRef.current
    if (!el) return
    el.style.transition = 'none'
    el.style.width = '100%'
    el.getBoundingClientRect()  // force reflow without void operator
    el.style.transition = `width ${DISMISS_MS}ms linear`
    el.style.width = '0%'
  }, [notification.live])

  // When live card transitions to finished (live → false), resume progress bar
  useEffect(() => {
    if (notification.live) return
    const el = progressRef.current
    if (!el) return
    // Animate from current width to 0 in remaining time
    const remaining = Math.max(0, DISMISS_MS - elapsed * 1000)
    el.style.transition = `width ${remaining}ms linear`
    el.style.width = '0%'
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notification.live])

  // Live elapsed counter for pit stops
  useEffect(() => {
    if (!notification.live) return
    startRealTime.current = Date.now()
    const id = setInterval(() => {
      setElapsed(((Date.now() - startRealTime.current) / 1000))
    }, 100)
    return () => clearInterval(id)
  }, [notification.live])

  // Display message: live pit timer shows counting seconds
  const displayMsg = notification.live
    ? `${notification.message?.split('—')[0]}— ${elapsed.toFixed(1)}s`
    : notification.message

  return (
    <div
      className="flex overflow-hidden bg-[#0d0d0d] border border-[#252525] shadow-2xl"
      style={{ minWidth: 268, maxWidth: 328, borderRadius: 2 }}
    >
      {/* Left colour bar */}
      <div
        className="w-[3px] flex-shrink-0"
        style={{ backgroundColor: colour }}
      />

      <div className="flex-1 px-2.5 py-2.5 pr-8 relative">
        {/* Dismiss button */}
        <button
          onClick={() => onDismiss(notification.id)}
          className="absolute top-1.5 right-2 text-[#333] hover:text-[#666] font-mono text-xs leading-none transition-colors"
          aria-label="Dismiss"
        >
          ✕
        </button>

        {/* Title */}
        <div
          className="font-mono text-[11px] font-bold tracking-widest mb-0.5"
          style={{ color: colour }}
        >
          {notification.title}
        </div>

        {/* Message / live counter */}
        <div className="font-mono text-[10px] text-[#777]">
          {displayMsg}
        </div>

        {/* Progress bar */}
        <div className="mt-2 h-px bg-[#1a1a1a] overflow-hidden">
          <div
            ref={progressRef}
            className="h-full"
            style={{ backgroundColor: colour, width: '100%' }}
          />
        </div>
      </div>
    </div>
  )
})


// ── Notification Stack ────────────────────────────────────────────────────────
export default function NotificationStack() {
  const notifications      = useF1Store((s) => s.notifications)
  const dismissNotification = useF1Store((s) => s.dismissNotification)

  // Auto-dismiss non-live notifications
  useEffect(() => {
    if (!notifications.length) return
    // Find first non-live notification from the top
    const target = notifications.find((n) => !n.live && !n.dismissed)
    if (!target) return
    const timer = setTimeout(() => dismissNotification(target.id), DISMISS_MS)
    return () => clearTimeout(timer)
  }, [notifications, dismissNotification])

  const visible = notifications.slice(0, 5)
  if (!visible.length) return null

  return (
    <div
      className="fixed z-[9999] flex flex-col gap-2 pointer-events-none"
      style={{ top: 68, right: 16, maxWidth: 328 }}
    >
      {visible.map((n) => (
        <div
          key={n.id}
          className="pointer-events-auto"
          style={{ animation: 'nSlideIn 0.18s ease forwards' }}
        >
          <NotificationCard notification={n} onDismiss={dismissNotification} />
        </div>
      ))}

      <style>{`
        @keyframes nSlideIn {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}
