import { useEffect, useRef, memo } from 'react'
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

const DISMISS_MS = 5000

// ── Single notification card ──────────────────────────────────────────────────
const NotificationCard = memo(function NotificationCard({ notification, onDismiss }) {
  const colour     = TYPE_COLOURS[notification.type] ?? TYPE_COLOURS.info
  const progressRef = useRef(null)

  // CSS progress bar countdown
  useEffect(() => {
    if (!progressRef.current) return
    const el = progressRef.current
    el.style.transition = 'none'
    el.style.width = '100%'
    // Force reflow
    void el.offsetWidth
    el.style.transition = `width ${DISMISS_MS}ms linear`
    el.style.width = '0%'
  }, [])

  return (
    <div
      className="flex overflow-hidden bg-[#111] border border-[#222] shadow-2xl"
      style={{ minWidth: 260, maxWidth: 320 }}
    >
      {/* Left colour bar */}
      <div className="w-1 flex-shrink-0" style={{ backgroundColor: colour }} />

      <div className="flex-1 p-2.5 pr-8 relative">
        {/* Dismiss button */}
        <button
          onClick={() => onDismiss(notification.id)}
          className="absolute top-1.5 right-2 text-[#444] hover:text-[#888] font-mono text-xs leading-none"
        >
          ✕
        </button>

        <div
          className="font-mono text-[11px] font-bold tracking-widest mb-0.5"
          style={{ color: colour }}
        >
          {notification.title}
        </div>
        <div className="font-mono text-[10px] text-[#888]">
          {notification.message}
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
  const notifications    = useF1Store((s) => s.notifications)
  const dismissNotification = useF1Store((s) => s.dismissNotification)

  // Auto-dismiss after DISMISS_MS
  useEffect(() => {
    if (notifications.length === 0) return
    const latest = notifications[0]
    if (latest.dismissed) return

    const timer = setTimeout(() => {
      dismissNotification(latest.id)
    }, DISMISS_MS)
    return () => clearTimeout(timer)
  }, [notifications, dismissNotification])

  // Show max 5
  const visible = notifications.slice(0, 5)

  if (visible.length === 0) return null

  return (
    <div
      className="fixed top-16 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
      style={{ maxWidth: 320 }}
    >
      {visible.map((n) => (
        <div
          key={n.id}
          className="pointer-events-auto"
          style={{
            animation: 'slideInRight 0.2s ease forwards',
          }}
        >
          <NotificationCard
            notification={n}
            onDismiss={dismissNotification}
          />
        </div>
      ))}

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}
