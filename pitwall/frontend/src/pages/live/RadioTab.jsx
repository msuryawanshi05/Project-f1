import { useEffect, useRef, useState, useCallback } from 'react'
import useF1Store from '../../store/useF1Store'
import { getTeamColour, degreesToCompass } from '../../utils/driverUtils'

// ── Audio manager — only one clip at a time ───────────────────────────────────
const audioRef = { current: null }

function playClip(url, id, setPlayingId) {
  if (audioRef.current) {
    audioRef.current.pause()
    audioRef.current = null
  }
  const a = new Audio(url)
  audioRef.current = a
  setPlayingId(id)
  a.play().catch(() => {})
  a.onended = () => setPlayingId(null)
  a.onerror = () => setPlayingId(null)
}

function stopClip(setPlayingId) {
  if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
  setPlayingId(null)
}

// ── Compass rose ─────────────────────────────────────────────────────────────
function CompassRose({ degrees = 0 }) {
  const cardinals = [
    { label: 'N', x: 30, y: 8  },
    { label: 'E', x: 52, y: 34 },
    { label: 'S', x: 30, y: 56 },
    { label: 'W', x: 8,  y: 34 },
  ]
  return (
    <svg viewBox="0 0 60 60" className="w-14 h-14">
      <circle cx="30" cy="30" r="28" fill="none" stroke="#222" strokeWidth="1" />
      <circle cx="30" cy="30" r="2" fill="#444" />
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
            stroke="#333" strokeWidth="1"
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
          fill="#555"
          fontFamily="JetBrains Mono"
        >{label}</text>
      ))}
      {/* Wind needle */}
      <line
        x1="30" y1="30"
        x2="30" y2="8"
        stroke="#E8002D"
        strokeWidth="2"
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
      <div className="flex items-center justify-center h-full font-mono text-xs text-pitwall-ghost">
        Weather data not available
      </div>
    )
  }

  const compassLabel = degreesToCompass(weather.wind_direction ?? 0)
  const isWet = weather.rainfall

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="font-mono text-[10px] text-pitwall-ghost tracking-widest uppercase">Weather</div>

      {/* Stat rows */}
      {[
        { label: 'TRACK',    value: `${weather.track_temperature ?? '—'}°C` },
        { label: 'AIR',      value: `${weather.air_temperature ?? '—'}°C` },
        { label: 'HUMIDITY', value: `${weather.humidity ?? '—'}%` },
        { label: 'PRESSURE', value: `${weather.pressure ?? '—'} hPa` },
      ].map(({ label, value }) => (
        <div key={label} className="flex items-baseline justify-between border-b border-pitwall-border pb-2">
          <span className="font-mono text-[10px] text-pitwall-ghost w-20">{label}</span>
          <span className="font-mono text-sm text-pitwall-text">{value}</span>
        </div>
      ))}

      {/* Wind */}
      <div className="border-b border-pitwall-border pb-3">
        <div className="font-mono text-[10px] text-pitwall-ghost mb-2">WIND</div>
        <div className="flex items-center gap-3">
          <CompassRose degrees={weather.wind_direction ?? 0} />
          <div>
            <div className="font-mono text-sm text-pitwall-text">{weather.wind_speed ?? '—'} km/h</div>
            <div className="font-mono text-xs text-pitwall-dim">{compassLabel}</div>
          </div>
        </div>
      </div>

      {/* Conditions */}
      <div>
        <div className="font-mono text-[10px] text-pitwall-ghost mb-1">CONDITIONS</div>
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: isWet ? '#0067FF' : '#00A651' }}
          />
          <span className={`font-mono text-sm ${isWet ? 'text-[#64C4FF]' : 'text-status-green'}`}>
            {isWet ? 'WET' : 'DRY'}
          </span>
        </div>
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
      className="flex gap-0 border-b border-pitwall-border hover:bg-pitwall-surface/30 transition-colors"
      style={{ borderLeft: `3px solid ${colour}` }}
    >
      {/* Info */}
      <div className="flex-1 px-3 py-2.5">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-mono font-medium text-sm text-white">{code}</span>
          <span className="font-body text-xs text-pitwall-dim truncate">{fullName}</span>
          {team && <span className="font-body text-xs text-pitwall-ghost truncate hidden lg:block">{team}</span>}
        </div>
        <div className="font-body text-xs text-pitwall-ghost italic mb-1.5">
          [Team radio — tap ▶ to play]
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-pitwall-ghost">
          {entry.lap && <span>Lap {entry.lap}</span>}
          {entry.date && <span>•</span>}
          {entry.date && <span>{new Date(entry.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
        </div>
      </div>

      {/* Play/Stop button */}
      <div className="flex items-center px-3 flex-shrink-0">
        <button
          onClick={() => isPlaying ? onStop() : onPlay(entry.recording_url, entry.id ?? entry.date)}
          className={`w-8 h-8 flex items-center justify-center border transition-colors ${
            isPlaying
              ? 'border-status-red text-status-red hover:bg-status-red/10'
              : 'border-pitwall-border text-pitwall-ghost hover:border-pitwall-dim hover:text-pitwall-dim'
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
const OPENF1_BASE = 'https://api.openf1.org/v1'

export default function RadioTab() {
  const session        = useF1Store((s) => s.session)
  const weather        = useF1Store((s) => s.weather)
  const drivers        = useF1Store((s) => s.drivers)
  const playingId      = useF1Store((s) => s.playingRadioId)
  const setPlayingId   = useF1Store((s) => s.setPlayingRadioId)

  const [radioClips, setRadioClips] = useState([])
  const feedRef = useRef(null)

  const isLive     = ['LIVE', 'RACE', 'QUALIFYING', 'PRACTICE'].includes(session.phase)
  const sessionKey = session.session_key ?? null

  // Poll OpenF1 /team_radio every 30s when live
  const fetchRadio = useCallback(async () => {
    if (!sessionKey) return
    try {
      const res  = await fetch(`${OPENF1_BASE}/team_radio?session_key=${sessionKey}`)
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        setRadioClips((prev) => {
          const existingDates = new Set(prev.map((c) => c.date))
          const newClips = data.filter((c) => !existingDates.has(c.date))
          if (newClips.length === 0) return prev
          return [...newClips.reverse(), ...prev]
        })
      }
    } catch {
      // Network error — keep last clips
    }
  }, [sessionKey])

  useEffect(() => {
    fetchRadio()
    if (!isLive) return
    const id = setInterval(fetchRadio, 30000)
    return () => clearInterval(id)
  }, [fetchRadio, isLive])

  // Auto-scroll to top when new clip arrives
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

  return (
    <div className="h-full flex overflow-hidden">

      {/* ── Left: Radio feed 65% ─────────────────────────────────── */}
      <div className="flex flex-col overflow-hidden border-r border-pitwall-border" style={{ width: '65%' }}>
        <div className="px-4 py-2 font-mono text-[10px] text-pitwall-ghost tracking-widest uppercase border-b border-pitwall-border bg-[#0d0d0d] flex-shrink-0">
          Team Radio
          {radioClips.length > 0 && (
            <span className="ml-2 text-pitwall-ghost/50">({radioClips.length})</span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto" ref={feedRef}>
          {radioClips.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-pitwall-ghost">
              <span className="font-mono text-sm">No team radio received yet</span>
              <span className="font-mono text-xs text-pitwall-ghost/50">
                Radio clips will appear here during the session
              </span>
            </div>
          ) : (
            radioClips.map((clip, i) => (
              <RadioCard
                key={clip.date ?? i}
                entry={clip}
                isPlaying={playingId === (clip.id ?? clip.date)}
                onPlay={handlePlay}
                onStop={handleStop}
                drivers={drivers}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right: Weather panel 35% ──────────────────────────────── */}
      <div className="flex-col overflow-y-auto bg-pitwall-surface" style={{ width: '35%' }}>
        <WeatherPanel weather={weather} />
      </div>
    </div>
  )
}
