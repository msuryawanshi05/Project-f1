import useF1Store from '../../store/useF1Store'

export default function StatusBar() {
  const session     = useF1Store((s) => s.session)
  const trackStatus = useF1Store((s) => s.trackStatus)
  const raceControl = useF1Store((s) => s.raceControl)
  const weather     = useF1Store((s) => s.weather)
  const calendar    = useF1Store((s) => s.calendar)
  const standings   = useF1Store((s) => s.standings)

  // Determine if there is a live session
  const isLive = session.phase !== 'PRE' && ['LIVE', 'RACE', 'QUALIFYING', 'PRACTICE'].includes(session.phase)

  // Find recent flag / delay / incident / weather message in raceControl
  const delayOrFlagMsg = raceControl.find((m) => {
    const txt = (m.message ?? m.msg ?? '').toUpperCase()
    return (
      txt.includes('DELAY') ||
      txt.includes('SUSPEND') ||
      txt.includes('RED FLAG') ||
      txt.includes('YELLOW FLAG') ||
      txt.includes('SAFETY CAR') ||
      txt.includes('RAIN') ||
      txt.includes('WET') ||
      txt.includes('WEATHER') ||
      txt.includes('SLIPPERY') ||
      txt.includes('START PROCEDURE') ||
      txt.includes('ABORTED')
    )
  })

  let flagReason = delayOrFlagMsg?.message ?? delayOrFlagMsg?.msg ?? null
  if (!flagReason && weather?.rainfall) {
    flagReason = 'Track wet / rain detected'
  }

  // Safety Car / Red Flag / Delay status badge with explicit reason
  const statusCode = trackStatus.status
  const isDelay = delayOrFlagMsg && (delayOrFlagMsg.message ?? '').toUpperCase().includes('DELAY')
  
  const scBadge =
    statusCode === '5' ? {
      label: flagReason ? `RED FLAG — ${flagReason.toUpperCase()}` : 'RED FLAG — SESSION SUSPENDED',
      cls: 'bg-[#E10600] text-white animate-pulse'
    } :
    statusCode === '4' ? {
      label: flagReason ? `SAFETY CAR — ${flagReason.toUpperCase()}` : 'SAFETY CAR DEPLOYED',
      cls: 'bg-[#FFA500] text-black animate-pulse'
    } :
    statusCode === '6' ? {
      label: flagReason ? `VSC — ${flagReason.toUpperCase()}` : 'VSC ACTIVE',
      cls: 'bg-[#FFD700] text-black animate-pulse'
    } :
    statusCode === '2' || statusCode === '3' ? {
      label: flagReason ? `YELLOW FLAG — ${flagReason.toUpperCase()}` : 'YELLOW FLAG',
      cls: 'bg-[#FFD700] text-black animate-pulse'
    } :
    isDelay ? {
      label: `RACE DELAYED — ${delayOrFlagMsg.message?.toUpperCase()}`,
      cls: 'bg-[#E10600] text-white animate-pulse'
    } :
    delayOrFlagMsg ? {
      label: `NOTICE: ${delayOrFlagMsg.message?.toUpperCase()}`,
      cls: 'bg-[#FF6B00] text-white animate-pulse'
    } :
    weather?.rainfall ? {
      label: 'TRACK WET — RAIN DETECTED',
      cls: 'bg-[#0067FF] text-white animate-pulse'
    } :
    null

  // Build ticker text based on session state and race control bulletins
  let tickerText = ''

  if (isLive) {
    const msgs = raceControl
      .slice(0, 6)
      .map((m) => `[${m.time ? m.time.substring(11, 19) : ''}] ${m.message ?? m.msg ?? ''}`)
      .join('   •   ')
    
    if (flagReason) {
      tickerText = `⚠️ NOTICE: ${flagReason.toUpperCase()}${msgs ? `   •   ${msgs}` : ''}`
    } else {
      tickerText = msgs || '● RACE CONTROL — MONITORING RADIO CHANNELS — NO ACTIVE INCIDENTS'
    }
  } else {
    // Construct news/standings/weather/bulletins ticker
    const now = new Date()
    const nextRace = calendar.find((r) => new Date(r.date) >= now)
    const leadDriver = standings.drivers[0]
    const leadConstructor = standings.constructors[0]

    const parts = []

    // 1. High-priority delay or weather notification at the very front
    if (delayOrFlagMsg) {
      const timeStr = delayOrFlagMsg.time ? `[${delayOrFlagMsg.time.substring(11, 16)}] ` : ''
      parts.push(`⚠️ RACE CONTROL BULLETIN: ${timeStr}${delayOrFlagMsg.message?.toUpperCase()}`)
    } else if (weather?.rainfall) {
      parts.push('🌧️ TRACK ALERT: RAIN DETECTED AT CIRCUIT — TRACK CONDITIONS WET')
    }

    // 2. Additional race control bulletins
    if (raceControl.length > 0) {
      const otherBulletins = raceControl
        .filter((m) => m !== delayOrFlagMsg)
        .slice(0, 3)
        .map((m) => {
          const timeStr = m.time ? `[${m.time.substring(11, 16)}] ` : ''
          return `RACE BULLETIN: ${timeStr}${m.message ?? m.msg ?? ''}`
        })
      parts.push(...otherBulletins)
    }

    // 3. Weather conditions
    if (weather) {
      const cond = weather.rainfall ? 'WET (RAIN DETECTED)' : 'DRY'
      parts.push(`TRACK WEATHER: AIR ${weather.air_temp ?? '—'}°C · TRACK ${weather.track_temp ?? '—'}°C · ${cond}`)
    }

    // 4. Next/Current GP info
    if (nextRace) {
      parts.push(`CURRENT RACE WEEKEND: ${nextRace.raceName?.toUpperCase()}`)
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
