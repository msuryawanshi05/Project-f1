import useF1Store from '../../store/useF1Store'

export default function StatusBar() {
  const session     = useF1Store((s) => s.session)
  const trackStatus = useF1Store((s) => s.trackStatus)
  const raceControl = useF1Store((s) => s.raceControl)
  const calendar    = useF1Store((s) => s.calendar)
  const standings   = useF1Store((s) => s.standings)

  // Determine if there is a live session
  const isLive = ['LIVE', 'RACE', 'QUALIFYING', 'PRACTICE'].includes(session.phase)

  // Safety Car / Red Flag status
  const statusCode = trackStatus.status
  const scBadge =
    statusCode === '4' ? { label: 'SAFETY CAR',  cls: 'bg-[#FFA500] text-black animate-pulse' } :
    statusCode === '5' ? { label: 'RED FLAG', cls: 'bg-[#E10600] text-white animate-pulse' } :
    statusCode === '6' ? { label: 'VSC ACTIVE', cls: 'bg-[#FFD700] text-black animate-pulse' } :
    null

  // Build ticker text based on session state
  let tickerText = ''

  if (isLive) {
    const msgs = raceControl
      .slice(0, 5)
      .map((m) => `[${m.time ?? ''}] ${m.message ?? m.msg ?? ''}`)
      .join('   •   ')
    tickerText = msgs || '● RACE CONTROL — MONITORING RADIO CHANNELS — NO ACTIVE INCIDENTS'
  } else {
    // Construct news/standings ticker for non-live view
    const now = new Date()
    const nextRace = calendar.find((r) => new Date(r.date) >= now)
    const leadDriver = standings.drivers[0]
    const leadConstructor = standings.constructors[0]

    const parts = []
    if (nextRace) {
      parts.push(`NEXT GP: ${nextRace.raceName?.toUpperCase()} (${nextRace.date})`)
    }
    if (leadDriver) {
      const code = leadDriver.Driver?.code ?? leadDriver.Driver?.familyName?.substring(0, 3).toUpperCase() ?? ''
      parts.push(`WDC LEADER: ${code} (${leadDriver.points} PTS)`)
    }
    if (leadConstructor) {
      parts.push(`WCC LEADER: ${leadConstructor.Constructor?.name?.toUpperCase()} (${leadConstructor.points} PTS)`)
    }

    tickerText = parts.length > 0
      ? `● ${parts.join('   •   ● ')}`
      : '● PITWALL SYSTEM — READY FOR 2026 WORLD CHAMPIONSHIP'
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 h-7 border-t border-pitwall-border flex items-center overflow-hidden glass-panel"
    >
      {/* Ticker source label */}
      <div className="flex-shrink-0 px-3 bg-pitwall-surface-2 text-pitwall-text-strong font-display text-[10px] font-bold tracking-widest uppercase border-r border-pitwall-border h-full flex items-center">
        {isLive ? 'RACE CONTROL' : 'PITWALL NEWS'}
      </div>

      {/* Scrolling marquee */}
      <div className="flex-1 overflow-hidden relative">
        <div className="ticker-track">
          <span className="font-mono text-[10px] text-pitwall-dim uppercase px-4 tracking-wider flex items-center gap-1">
            {tickerText}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{tickerText}
          </span>
        </div>
      </div>

      {/* Live Indicator */}
      <div className="flex-shrink-0 px-3 border-l border-pitwall-border h-full flex items-center gap-1.5 bg-pitwall-surface-2">
        <span className={`led-dot ${isLive ? 'red' : 'dim'}`} />
        <span className="font-mono text-[9px] text-pitwall-ghost tracking-widest uppercase">
          {isLive ? 'LIVE FEED' : 'STANDBY'}
        </span>
      </div>

      {/* Track safety status badge */}
      {scBadge && (
        <div className={`flex-shrink-0 px-3 h-full flex items-center font-display text-[10px] font-extrabold tracking-widest border-l border-pitwall-border ${scBadge.cls}`}>
          {scBadge.label}
        </div>
      )}
    </div>
  )
}
