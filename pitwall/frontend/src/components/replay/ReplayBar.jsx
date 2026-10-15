import { useCallback, useMemo, useRef, useState } from 'react'
import { useReplayControls, useReplayMarkers } from '../../hooks/useReplay'

/**
 * The replay transport.
 *
 * Pinned above the Live sub-tabs, where it is impossible to miss. A viewer must
 * never be in doubt about whether they are watching a recording: the REPLAY
 * badge, the Grand Prix, the session and its date are all on the bar, not
 * hidden behind a tooltip.
 */

const SPEEDS = [1, 2, 5, 10]

const MARKER_STYLE = {
  sc:   { colour: 'var(--pw-status-yellow, #FFD200)', height: 10 },
  vsc:  { colour: 'var(--pw-status-yellow, #FFD200)', height: 7 },
  red:  { colour: '#E10600', height: 12 },
  flag: { colour: '#E10600', height: 9 },
  pit:  { colour: 'var(--pw-ghost)', height: 5 },
  lead: { colour: '#00C853', height: 9 },
}

function clock(seconds) {
  if (!Number.isFinite(seconds)) return '--:--'
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/**
 * The scrub bar.
 *
 * Markers are the point of it: a flat grey line tells a viewer nothing about
 * where the interesting two minutes of a two-hour race are. Safety cars, pit
 * stops and lead changes are drawn in place, so the bar is a map of the race
 * rather than just a position indicator.
 */
function ScrubBar({ position, duration, markers, onSeek }) {
  const trackRef = useRef(null)
  const [hover, setHover] = useState(null)

  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0

  const seekFromEvent = useCallback((e) => {
    const el = trackRef.current
    if (!el || !duration) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    onSeek(ratio * duration)
  }, [duration, onSeek])

  return (
    <div className="flex-1 flex items-center gap-2 min-w-0">
      <span className="font-mono text-[10px] tabular-nums flex-shrink-0 w-10 text-right"
        style={{ color: 'var(--pw-dim)' }}>
        {clock(position)}
      </span>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Replay position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(position)}
        aria-valuetext={clock(position)}
        className="relative flex-1 h-5 cursor-pointer select-none group"
        onClick={seekFromEvent}
        onMouseMove={(e) => {
          const el = trackRef.current
          if (!el || !duration) return
          const rect = el.getBoundingClientRect()
          const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
          setHover({ x: ratio * 100, t: ratio * duration })
        }}
        onMouseLeave={() => setHover(null)}
        onKeyDown={(e) => {
          // Arrow keys nudge, page keys jump a minute. A scrub bar that can
          // only be dragged is unusable without a mouse.
          const step = e.shiftKey ? 60 : 10
          if (e.key === 'ArrowRight') { e.preventDefault(); onSeek(Math.min(duration, position + step)) }
          if (e.key === 'ArrowLeft') { e.preventDefault(); onSeek(Math.max(0, position - step)) }
          if (e.key === 'Home') { e.preventDefault(); onSeek(0) }
          if (e.key === 'End') { e.preventDefault(); onSeek(duration) }
        }}
      >
        {/* track */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[3px] rounded-sm"
          style={{ background: 'var(--pw-muted, #2a2a2e)' }} />
        {/* played */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-[3px] rounded-sm"
          style={{ width: `${pct}%`, background: 'var(--pw-text-strong)' }} />

        {/* markers */}
        {duration > 0 && markers.map((m, i) => {
          const style = MARKER_STYLE[m.kind] ?? MARKER_STYLE.pit
          return (
            <span
              key={`${m.t}-${m.kind}-${i}`}
              title={`${clock(m.t)} · ${m.label}`}
              className="absolute top-1/2 -translate-y-1/2 w-[2px] rounded-full pointer-events-none"
              style={{
                left: `${(m.t / duration) * 100}%`,
                height: style.height,
                background: style.colour,
                opacity: m.kind === 'pit' ? 0.5 : 0.9,
              }}
            />
          )
        })}

        {/* playhead */}
        <span
          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full shadow"
          style={{ left: `calc(${pct}% - 4px)`, background: '#E10600' }}
        />

        {hover && (
          <span
            className="absolute -top-5 px-1 py-0.5 rounded-sm font-mono text-[9px] tabular-nums pointer-events-none whitespace-nowrap"
            style={{
              left: `${hover.x}%`,
              transform: 'translateX(-50%)',
              background: 'var(--pw-surface-2)',
              color: 'var(--pw-text)',
              border: '1px solid var(--pw-border)',
            }}
          >
            {clock(hover.t)}
          </span>
        )}
      </div>

      <span className="font-mono text-[10px] tabular-nums flex-shrink-0 w-10"
        style={{ color: 'var(--pw-ghost)' }}>
        {clock(duration)}
      </span>
    </div>
  )
}

export default function ReplayBar({ sessions = [] }) {
  const { replay, play, pause, setSpeed, seek, nextEvent, exit, load } = useReplayControls()
  const markers = useReplayMarkers(replay.weekend, replay.session)

  const sessionDate = useMemo(() => {
    if (!replay.virtualNow) return null
    try {
      return new Intl.DateTimeFormat(undefined, {
        day: 'numeric', month: 'short', year: 'numeric',
      }).format(new Date(replay.virtualNow))
    } catch { return null }
  }, [replay.virtualNow])

  if (!replay.active) return null

  const btn = 'font-mono text-[10px] tracking-wider uppercase px-2 py-1 border rounded-sm transition-colors'

  return (
    <div
      role="region"
      aria-label="Replay controls"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-1.5 border-b"
      style={{ borderColor: 'var(--pw-border)', background: 'var(--pw-surface-2)' }}
    >
      {/* The thing a viewer must never miss. */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span
          className="font-display text-[10px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded-sm"
          style={{ background: '#E10600', color: '#fff' }}
        >
          ● Replay
        </span>
        <span className="font-display text-[11px] font-bold tracking-wide uppercase"
          style={{ color: 'var(--pw-text-strong)' }}>
          {replay.weekendName?.replace(' Grand Prix', ' GP') ?? replay.weekend}
        </span>
        <span className="font-mono text-[10px]" style={{ color: 'var(--pw-dim)' }}>
          {replay.sessionLabel}
          {sessionDate && <span style={{ color: 'var(--pw-ghost)' }}> · {sessionDate}</span>}
        </span>
      </div>

      {/* Session picker for the bundled weekend. */}
      {sessions.length > 1 && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {sessions.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => load(replay.weekend, s.label.toLowerCase())}
              className={`${btn} ${s.label === replay.sessionLabel ? 'font-bold' : ''}`}
              style={{
                borderColor: s.label === replay.sessionLabel ? 'var(--pw-text-strong)' : 'transparent',
                color: s.label === replay.sessionLabel ? 'var(--pw-text-strong)' : 'var(--pw-ghost)',
              }}
            >
              {s.label === 'QUALIFYING' ? 'QUALI' : s.label}
            </button>
          ))}
        </div>
      )}

      {/* Transport */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={() => (replay.playing ? pause() : play())}
          aria-label={replay.playing ? 'Pause replay' : 'Play replay'}
          className={`${btn} w-9 text-center`}
          style={{ borderColor: 'var(--pw-border)', color: 'var(--pw-text-strong)' }}
        >
          {replay.playing ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          onClick={nextEvent}
          title="Jump to the next pit stop, safety car or lead change"
          className={btn}
          style={{ borderColor: 'var(--pw-border)', color: 'var(--pw-dim)' }}
        >
          ⏭ Event
        </button>
        <div className="flex items-center ml-1 rounded-sm border"
          style={{ borderColor: 'var(--pw-border)' }}>
          {SPEEDS.map((x) => (
            <button
              key={x}
              type="button"
              onClick={() => setSpeed(x)}
              aria-pressed={replay.speed === x}
              className="font-mono text-[10px] px-1.5 py-1 transition-colors"
              style={{
                color: replay.speed === x ? 'var(--pw-text-strong)' : 'var(--pw-ghost)',
                background: replay.speed === x ? 'var(--pw-muted, #2a2a2e)' : 'transparent',
                fontWeight: replay.speed === x ? 700 : 400,
              }}
            >
              {x}×
            </button>
          ))}
        </div>
      </div>

      <ScrubBar
        position={replay.position}
        duration={replay.duration}
        markers={markers}
        onSeek={seek}
      />

      <button
        type="button"
        onClick={exit}
        className={`${btn} flex-shrink-0`}
        style={{ borderColor: 'var(--pw-border)', color: 'var(--pw-ghost)' }}
      >
        Exit replay
      </button>
    </div>
  )
}
