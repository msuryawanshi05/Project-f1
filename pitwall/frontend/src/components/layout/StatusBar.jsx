import useF1Store from '../../store/useF1Store'

export default function StatusBar() {
  const session     = useF1Store((s) => s.session)
  const trackStatus = useF1Store((s) => s.trackStatus)
  const raceControl = useF1Store((s) => s.raceControl)

  // Only visible during live sessions
  const isLive = ['LIVE', 'RACE', 'QUALIFYING', 'PRACTICE'].includes(session.phase)
  if (!isLive) return null

  const statusCode = trackStatus.status
  const scBadge =
    statusCode === '4' ? { label: 'SC',  cls: 'bg-status-sc text-black' } :
    statusCode === '5' ? { label: 'RED', cls: 'bg-status-red text-white' } :
    statusCode === '6' ? { label: 'VSC', cls: 'bg-status-vsc text-black' } :
    null

  // Build ticker text from last 5 race control messages
  const msgs = raceControl
    .slice(0, 5)
    .map((m) => `${m.time ?? ''} — ${m.message ?? m.msg ?? ''}`)
    .join('   •   ')

  const tickerText = msgs || '● RACE CONTROL — AWAITING MESSAGES'

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 h-7 bg-pitwall-surface border-t border-pitwall-border flex items-center overflow-hidden">
      {/* Label */}
      <div className="flex-shrink-0 px-3 text-pitwall-ghost font-mono text-[10px] tracking-wider uppercase border-r border-pitwall-border h-full flex items-center">
        RC
      </div>

      {/* Scrolling messages */}
      <div className="flex-1 overflow-hidden relative">
        <div className="ticker-track">
          <span className="font-mono text-[11px] text-pitwall-dim px-4">
            {tickerText}&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;{tickerText}
          </span>
        </div>
      </div>

      {/* Status badge */}
      {scBadge && (
        <div className={`flex-shrink-0 px-3 h-full flex items-center font-display text-xs font-bold tracking-wider border-l border-pitwall-border ${scBadge.cls}`}>
          {scBadge.label}
        </div>
      )}
    </div>
  )
}
