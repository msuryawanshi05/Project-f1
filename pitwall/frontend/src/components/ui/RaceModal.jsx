/**
 * RaceModal.jsx
 * Full-detail modal for an upcoming F1 race weekend.
 * Shows: race name, circuit, location, all session times, track map, circuit stats.
 */

import { useEffect } from 'react'
import TrackMap from './TrackMap'

const FLAGS = {
  Japan: '🇯🇵', Australia: '🇦🇺', China: '🇨🇳', Bahrain: '🇧🇭',
  'Saudi Arabia': '🇸🇦', 'United States': '🇺🇸', 'United Arab Emirates': '🇦🇪',
  Brazil: '🇧🇷', Mexico: '🇲🇽', Italy: '🇮🇹', Spain: '🇪🇸',
  Monaco: '🇲🇨', Canada: '🇨🇦', Austria: '🇦🇹', UK: '🇬🇧',
  'United Kingdom': '🇬🇧', Belgium: '🇧🇪', Netherlands: '🇳🇱',
  Hungary: '🇭🇺', Azerbaijan: '🇦🇿', Singapore: '🇸🇬',
  Qatar: '🇶🇦', UAE: '🇦🇪', USA: '🇺🇸',
}

function formatSessionTime(dateStr, timeStr) {
  if (!dateStr) return null
  try {
    const dt = new Date(`${dateStr}T${timeStr ?? '12:00:00Z'}`)
    return dt.toLocaleString('en-GB', {
      weekday: 'short', day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    })
  } catch {
    return dateStr
  }
}

function buildSessions(race) {
  const sessions = []
  if (race.FirstPractice?.date)  sessions.push({ label: 'Practice 1',  ...race.FirstPractice })
  if (race.SecondPractice?.date) sessions.push({ label: 'Practice 2',  ...race.SecondPractice })
  if (race.ThirdPractice?.date)  sessions.push({ label: 'Practice 3',  ...race.ThirdPractice })
  if (race.Sprint?.date)         sessions.push({ label: 'Sprint Race',  ...race.Sprint })
  if (race.Qualifying?.date)     sessions.push({ label: 'Qualifying',   ...race.Qualifying })
  if (race.date)                 sessions.push({ label: 'RACE',         date: race.date, time: race.time ?? '14:00:00Z' })
  return sessions
}

export default function RaceModal({ race, circuitData, onClose }) {
  if (!race) return null

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const flag     = FLAGS[race.Circuit?.Location?.country] ?? '🏁'
  const sessions = buildSessions(race)
  const now      = new Date()

  const isPastSession = (s) => {
    try { return new Date(`${s.date}T${s.time ?? '12:00:00Z'}`) < now } catch { return false }
  }

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-[200] flex items-start justify-end bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Panel — slides in from right */}
      <div className="w-full max-w-xl h-full bg-pitwall-surface border-l border-pitwall-border overflow-y-auto flex flex-col animate-slide-in-right">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-pitwall-surface border-b border-pitwall-border px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] text-pitwall-ghost tracking-widest uppercase mb-1">
              Round {race.round} · 2026 FIA Formula 1
            </div>
            <h2 className="font-display font-bold text-2xl text-white tracking-wide uppercase leading-tight">
              {flag} {race.raceName}
            </h2>
            <div className="font-mono text-xs text-pitwall-dim mt-1">
              {race.Circuit?.circuitName} · {race.Circuit?.Location?.locality}, {race.Circuit?.Location?.country}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center border border-pitwall-border text-pitwall-ghost hover:text-white hover:border-pitwall-muted transition-colors font-mono text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Track Map */}
        <div className="px-6 pt-5">
          <TrackMap circuitData={circuitData} compact={false} showStats />
        </div>

        {/* Weekend Schedule */}
        <div className="px-6 pt-5 pb-4">
          <div className="font-mono text-[10px] text-pitwall-ghost tracking-widest uppercase mb-3">
            Weekend Schedule
          </div>
          <div className="space-y-0.5">
            {sessions.map((s) => {
              const past    = isPastSession(s)
              const isRace  = s.label === 'RACE'
              const formatted = formatSessionTime(s.date, s.time)
              return (
                <div
                  key={s.label}
                  className={`flex items-center gap-4 px-3 py-2.5 border border-pitwall-border ${
                    past
                      ? 'opacity-40 bg-transparent'
                      : isRace
                      ? 'bg-status-red/10 border-status-red/30'
                      : 'bg-pitwall-bg'
                  }`}
                >
                  <span className={`font-mono text-[10px] tracking-widest w-3 ${past ? 'text-pitwall-ghost' : isRace ? 'text-status-red' : 'text-pitwall-dim'}`}>
                    {past ? '✓' : isRace ? '⬤' : '○'}
                  </span>
                  <span className={`font-display font-semibold text-sm tracking-wide flex-shrink-0 w-28 ${
                    past ? 'text-pitwall-ghost' : isRace ? 'text-status-red' : 'text-pitwall-text'
                  }`}>
                    {s.label}
                  </span>
                  <span className="font-mono text-xs text-pitwall-dim truncate">
                    {formatted}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Circuit notes (2026 regulation callout — no DRS) */}
        <div className="mx-6 mb-6 px-3 py-2 bg-[#0d0d0d] border border-pitwall-border">
          <div className="font-mono text-[9px] text-pitwall-ghost tracking-widest uppercase mb-1">2026 Regulations</div>
          <div className="font-mono text-[10px] text-pitwall-dim">
            No DRS in 2026. Active aero (manual override) replaces DRS under FIA 2026 Technical Regulations.
          </div>
        </div>
      </div>
    </div>
  )
}
