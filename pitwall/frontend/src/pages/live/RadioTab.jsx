import { useEffect, useRef, useState, useCallback, memo } from 'react'
import { motion } from 'framer-motion'
import useF1Store from '../../store/useF1Store'
import { getTeamColour, degreesToCompass } from '../../utils/driverUtils'
import { EmptyState } from '../../components/ui/EmptyState'

// ── Audio manager ─────────────────────────────────────────────────────────────
// Plays ONLY real recording_url values returned by OpenF1 /v1/team_radio.
// There is deliberately no synthetic/simulated fallback: this panel used to
// inject canned driver quotes with speech-synthesis audio every 35 s during a
// live session, labelled identically to real intercepts. Fans could not tell
// the two apart. An empty feed is correct; an invented one is not.
const audioRef = { current: null }

function playClip(url, id, setPlayingId) {
  if (!url) return
  stopClip(setPlayingId)
  
  const a = new Audio(url)
  audioRef.current = a
  setPlayingId(id)
  a.play().catch(() => {})
  a.onended = () => setPlayingId(null)
  a.onerror = () => setPlayingId(null)
}

function stopClip(setPlayingId) {
  if (audioRef.current) {
    try {
      audioRef.current.pause()
    } catch (_) {}
    audioRef.current = null
  }
  setPlayingId(null)
}

// ── Audio Waveform Visualizer ───────────────────────────────────────────────
const AudioWaveform = memo(function AudioWaveform() {
  return (
    <div className="flex items-end gap-0.5 h-4 px-2.5 flex-shrink-0">
      {[1, 2, 3, 4, 5].map((bar) => {
        const duration = 0.4 + Math.random() * 0.4
        const delay = Math.random() * 0.3
        return (
          <motion.div
            key={bar}
            animate={{ height: [4, 16, 4] }}
            transition={{ duration, repeat: Infinity, delay, ease: 'easeInOut' }}
            className="w-[2px] bg-status-red rounded-full shadow-[0_0_8px_var(--pw-red)]"
          />
        )
      })}
    </div>
  )
})

// ── Compass rose ─────────────────────────────────────────────────────────────
function CompassRose({ degrees = 0 }) {
  const cardinals = [
    { label: 'N', x: 30, y: 8  },
    { label: 'E', x: 52, y: 34 },
    { label: 'S', x: 30, y: 56 },
    { label: 'W', x: 8,  y: 34 },
  ]
  return (
    <svg viewBox="0 0 60 60" className="w-14 h-14 filter drop-shadow-md">
      <circle cx="30" cy="30" r="28" fill="var(--pw-surface)" stroke="var(--pw-border)" strokeWidth="1" />
      <circle cx="30" cy="30" r="2" fill="var(--pw-ghost)" />
      {/* Tick marks at 8 cardinal points */}
      {[0,45,90,135,180,225,270,315].map((a) => {
        const rad = (a - 90) * Math.PI / 180
        return (
          <line
            key={a}
            x1={30 + 22 * Math.cos(rad)}
            y1={30 + 22 * Math.sin(rad)}
            x2={30 + 25 * Math.cos(rad)}
            y2={30 + 25 * Math.sin(rad)}
            stroke="var(--pw-border)" strokeWidth="1"
          />
        )
      })}
      {cardinals.map(({ label, x, y }) => (
        <text
          key={label}
          x={x} y={y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="7"
          fill="var(--pw-ghost)"
          fontFamily="Orbitron"
          fontWeight="bold"
        >{label}</text>
      ))}
      {/* Wind needle */}
      <line
        x1="30" y1="30"
        x2="30" y2="8"
        stroke="var(--pw-red)"
        strokeWidth="2.5"
        strokeLinecap="round"
        transform={`rotate(${degrees} 30 30)`}
      />
    </svg>
  )
}

// ── Weather panel (full detail) ───────────────────────────────────────────────
function WeatherPanel({ weather }) {
  if (!weather) {
    return (
      <div className="flex items-center justify-center h-full bg-carbon">
        <EmptyState
          icon="🌦️"
          title="Weather Offline"
          message="No active weather telemetry from the local track weather station."
        />
      </div>
    )
  }

  const compassLabel = degreesToCompass(weather.wind_direction ?? 0)
  const isWet = weather.rainfall

  return (
    <div className="flex flex-col gap-4 p-5 bg-carbon bg-grid-pattern h-full">
      <div className="font-display text-[10px] text-pitwall-dim tracking-widest uppercase font-bold">Weather Station</div>

      {/* Stat rows */}
      <div className="space-y-1 bg-pitwall-surface-2 p-3 rounded-sm border border-pitwall-border shadow-inner">
        {[
          { label: 'TRACK TEMP', value: `${weather.track_temp ?? weather.track_temperature ?? '—'}°C` },
          { label: 'AIR TEMP',   value: `${weather.air_temp ?? weather.air_temperature ?? '—'}°C` },
          { label: 'HUMIDITY',   value: `${weather.humidity ?? '—'}%` },
          { label: 'PRESSURE',   value: `${weather.pressure ?? '—'} hPa` },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-baseline justify-between border-b border-pitwall-border pb-2 last:border-0 last:pb-0 pt-1">
            <span className="font-display text-[10px] font-bold text-pitwall-dim w-24 tracking-wider">{label}</span>
            <span className="font-mono text-sm text-pitwall-text-strong font-semibold">{value}</span>
          </div>
        ))}
      </div>

      {/* Wind */}
      <div className="bg-pitwall-surface-2 p-3 rounded-sm border border-pitwall-border shadow-inner">
        <div className="font-display text-[10px] font-bold text-pitwall-dim mb-2 tracking-wider">WIND DIRECTION & SPEED</div>
        <div className="flex items-center gap-4">
          <CompassRose degrees={weather.wind_direction ?? 0} />
          <div>
            <div className="font-mono text-sm text-pitwall-text-strong font-bold">{weather.wind_speed ?? '—'} <span className="text-[10px] text-pitwall-ghost">KM/H</span></div>
            <div className="font-display text-[10px] font-extrabold text-pitwall-dim uppercase tracking-wider">{compassLabel} ({weather.wind_direction}° )</div>
          </div>
        </div>
      </div>

      {/* Conditions */}
      <div className="bg-pitwall-surface-2 p-3 rounded-sm border border-pitwall-border shadow-inner flex items-center justify-between">
        <div>
          <div className="font-display text-[10px] font-bold text-pitwall-dim tracking-wider">TRACK CONDITION</div>
          <div className="font-display text-sm font-black mt-1 uppercase tracking-widest" style={{ color: isWet ? '#0067FF' : 'var(--pw-green)' }}>
            {isWet ? '🌧️ WET TRACK' : '☀️ DRY TRACK'}
          </div>
        </div>
        <span
          className="w-3.5 h-3.5 rounded-full led-dot"
          style={{ 
            backgroundColor: isWet ? '#0067FF' : 'var(--pw-green)',
            color: isWet ? '#0067FF' : 'var(--pw-green)'
          }}
        />
      </div>
    </div>
  )
}

// ── Radio card ────────────────────────────────────────────────────────────────
function RadioCard({ entry, isPlaying, onPlay, onStop, drivers }) {
  const driver    = drivers.find((d) => String(d.number) === String(entry.driver_number)) ?? {}
  const code      = driver.short_name ?? driver.code ?? `#${entry.driver_number}`
  const fullName  = driver.full_name ?? ''
  const colour    = getTeamColour(entry.driver_number, drivers)
  const team      = driver.team_name ?? ''

  return (
    <div
      className="flex gap-0 border-b border-pitwall-border hover:bg-pitwall-surface/20 transition-colors select-none"
      style={{ borderLeft: `3px solid ${colour}` }}
    >
      {/* Info */}
      <div className="flex-1 px-4 py-3">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-display font-extrabold text-sm text-pitwall-text-strong tracking-widest">{code}</span>
          <span className="font-body text-xs text-pitwall-dim truncate">{fullName}</span>
          {team && <span className="font-display text-[10px] font-bold text-pitwall-ghost truncate hidden lg:block uppercase">{team}</span>}
        </div>
        
        {isPlaying ? (
          <div className="font-display text-[10px] text-status-red font-bold tracking-widest animate-pulse mt-0.5 flex items-center">
            ● STREAMING AUDIO...
          </div>
        ) : (
          <div className="font-display text-[10px] text-pitwall-ghost font-medium tracking-wider mt-0.5">
            TEAM TRANSMISSION INTERCEPTED
          </div>
        )}

        <div className="flex items-center gap-2 font-mono text-[9px] text-pitwall-ghost mt-2 uppercase font-semibold">
          {entry.lap && <span>LAP {entry.lap}</span>}
          {entry.lap && <span>•</span>}
          {entry.date && <span>{new Date(entry.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
        </div>
      </div>

      {/* Visualizer when playing */}
      {isPlaying && (
        <div className="flex items-center">
          <AudioWaveform />
        </div>
      )}

      {/* Play/Stop button */}
      <div className="flex items-center px-4 flex-shrink-0">
        <button
          onClick={() => isPlaying ? onStop() : onPlay(entry.recording_url, entry.id ?? entry.date)}
          className={`w-9 h-9 rounded-sm flex items-center justify-center border font-mono text-sm transition-all active:scale-[0.96] ${
            isPlaying
              ? 'border-status-red text-status-red bg-status-red/10 shadow-sm shadow-status-red/20'
              : 'border-pitwall-border text-pitwall-ghost bg-pitwall-surface hover:border-pitwall-ghost hover:text-pitwall-text-strong'
          }`}
          disabled={!entry.recording_url}
          title={entry.recording_url ? (isPlaying ? 'Stop' : 'Play') : 'No audio URL'}
        >
          {isPlaying ? '■' : '▶'}
        </button>
      </div>
    </div>
  )
}

// ── Radio Tab ─────────────────────────────────────────────────────────────────
export default function RadioTab() {
  const session        = useF1Store((s) => s.session)
  const weather        = useF1Store((s) => s.weather)
  const drivers        = useF1Store((s) => s.drivers)
  const playingId      = useF1Store((s) => s.playingRadioId)
  const setPlayingId   = useF1Store((s) => s.setPlayingRadioId)
  const sessionKey     = useF1Store((s) => s.currentSessionKey)
  const raceControl    = useF1Store((s) => s.raceControl)

  const isFormationLap = raceControl.some((m) => {
    const txt = (m.message || m.msg || '').toUpperCase()
    return txt.includes('FORMATION LAP') || txt.includes('START PROCEDURE')
  })

  const isLive = isFormationLap || (session.phase !== 'PRE' && ['LIVE', 'RACE', 'QUALIFYING', 'PRACTICE', 'FORMATION'].includes(session.phase))

  // Never pre-populate with past race clips — always start empty
  const [radioClips, setRadioClips] = useState([])

  // Clear clips whenever session is not actively live
  useEffect(() => {
    if (!isLive) {
      setRadioClips([])
    }
  }, [isLive])

  const feedRef = useRef(null)

  // Fetch real team radio clips from OpenF1
  const fetchRealRadio = useCallback(async () => {
    if (!isLive || !sessionKey) return []
    try {
      const PROXY = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000') + '/api/openf1'
      const res = await fetch(`${PROXY}/v1/team_radio?session_key=${sessionKey}`)
      if (!res.ok) return []
      const data = await res.json()
      if (Array.isArray(data)) {
        return data.map((item) => {
          const d = drivers.find((drv) => String(drv.number) === String(item.driver_number)) ?? {}
          const code = d.short_name ?? d.code ?? `#${item.driver_number}`
          return {
            id: `real-r-${item.date}-${item.driver_number}`,
            driver_number: item.driver_number,
            code,
            date: item.date,
            lap: session.lap ? `LAP ${session.lap}` : (isFormationLap ? 'FORMATION LAP' : 'LAP 1'),
            recording_url: item.recording_url,
            message: `INTERCEPTED TEAM TRANSMISSION FROM DRIVER ${code}`,
          }
        }).reverse()
      }
    } catch (_) {}
    return []
  }, [isLive, sessionKey, session.lap, isFormationLap, drivers])

  // Initial load fetch for real radio only during live session
  useEffect(() => {
    if (!isLive || !sessionKey) return
    let active = true
    fetchRealRadio().then((realClips) => {
      if (active && realClips.length > 0) {
        setRadioClips(realClips.slice(0, 20))
      }
    })
    return () => { active = false }
  }, [isLive, sessionKey, fetchRealRadio])

  // Poll real OpenF1 radio every 20s during live session
  useEffect(() => {
    if (!isLive || !sessionKey) return
    
    const fetchInterval = setInterval(async () => {
      const realClips = await fetchRealRadio()
      if (realClips.length > 0) {
        setRadioClips((prev) => {
          const existingIds = new Set(prev.map((c) => c.id))
          const fresh = realClips.filter((c) => !existingIds.has(c.id))
          if (fresh.length === 0) return prev
          return [...fresh, ...prev].slice(0, 30)
        })
      }
    }, 20000)
    
    return () => clearInterval(fetchInterval)
  }, [isLive, sessionKey, fetchRealRadio])

  // Auto-scroll to top when a new clip arrives
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = 0
    }
  }, [radioClips.length])

  function handlePlay(url, id) {
    playClip(url, id, setPlayingId)
  }
  
  function handleStop() {
    stopClip(setPlayingId)
  }

  // Standby screen when session is not active
  if (!isLive) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-200px)] bg-pitwall-bg w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl w-full px-6">
          <EmptyState
            icon="📻"
            title="Radio Feed Standby"
            message="Team radio is published by OpenF1 during and shortly after a live session. Nothing is shown outside one."
            className="w-full my-0"
          />
          <div className="bg-pitwall-surface border border-pitwall-border p-4 rounded-sm flex flex-col justify-center">
            <div className="font-mono text-[10px] text-pitwall-ghost tracking-widest uppercase mb-3">Live Track Weather</div>
            <WeatherPanel weather={weather} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex overflow-hidden">

      {/* ── Left: Radio feed 65% ─────────────────────────────────── */}
      <div className="flex flex-col overflow-hidden border-r border-pitwall-border bg-pitwall-bg" style={{ width: '65%' }}>
        <div className="px-4 py-2 font-display text-[10px] text-pitwall-dim tracking-widest uppercase border-b border-pitwall-border bg-pitwall-surface-2 flex-shrink-0 font-bold flex items-center justify-between">
          <span>Intercepted Team Radio</span>
          {radioClips.length > 0 && (
            <span className="font-mono text-[9px] bg-white/5 px-1.5 py-0.5 rounded-sm text-pitwall-dim">({radioClips.length} CLIPS)</span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-pitwall-border/30" ref={feedRef}>
          {radioClips.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full bg-carbon px-4">
              <EmptyState
                icon="📻"
                title="Awaiting Transmissions"
                message="Connected to the team radio feed. Clips appear here as they are published — only genuine recordings are ever shown."
              />
            </div>
          ) : (
            radioClips.map((clip, i) => (
              <RadioCard
                key={clip.id ?? i}
                entry={clip}
                isPlaying={playingId === (clip.id ?? clip.date)}
                onPlay={(url, id) => handlePlay(url, id)}
                onStop={handleStop}
                drivers={drivers}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right: Weather panel 35% ──────────────────────────────── */}
      <div className="flex flex-col overflow-y-auto bg-pitwall-surface border-l border-pitwall-border" style={{ width: '35%' }}>
        <WeatherPanel weather={weather} />
      </div>
    </div>
  )
}
