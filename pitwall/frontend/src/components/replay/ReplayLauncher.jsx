import { useState } from 'react'
import useF1Store from '../../store/useF1Store'
import { useReplayCatalogue, useReplayControls } from '../../hooks/useReplay'

/**
 * The way into replay, shown on the Live tower when nothing is running.
 *
 * Deliberately not styled as an apology. On the public deployment F1's timing
 * feed refuses the server's network, so this is not a fallback for a broken
 * live view — it is the only way the tower, strategy, telemetry and radio tabs
 * can show anything at all, and it is a real race rather than invented data.
 */
export default function ReplayLauncher({ compact = false }) {
  const catalogue = useReplayCatalogue()
  const { load, play, seek, ready } = useReplayControls()
  const [starting, setStarting] = useState(null)

  if (catalogue.loading || !catalogue.available) return null

  const weekend = catalogue.weekends[0]
  if (!weekend) return null

  const sessions = weekend.sessions ?? []
  const race = sessions.find((s) => s.kind === 'race') ?? sessions[sessions.length - 1]

  const start = (session) => {
    if (!ready) return
    setStarting(session.label)
    // Load at zero, then jump to just before the first car completes a lap.
    //
    // At lights out there is nothing on a timing screen — nobody has set a
    // time — and at Monza the first lap takes 95 seconds. Opening on an empty
    // tower is accurate and a terrible first impression. The scrubber still
    // reaches zero for anyone who wants the start.
    load(weekend.slug, session.label.toLowerCase(), 0)
    setTimeout(() => {
      const ft = useF1Store.getState().replay.firstTiming ?? 0
      if (ft > 10) seek(Math.max(0, ft - 8))
      play()
      setStarting(null)
    }, 350)
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => race && start(race)}
        disabled={!ready}
        className="font-display text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-sm transition-colors disabled:opacity-40"
        style={{ background: '#E10600', color: '#fff' }}
      >
        ▶ Watch a replay
      </button>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
      <span
        className="font-display text-[10px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded-sm"
        style={{ background: '#E10600', color: '#fff' }}
      >
        Replay
      </span>

      <div className="font-display text-base font-bold tracking-wide uppercase"
        style={{ color: 'var(--pw-text-strong)' }}>
        {weekend.name?.replace(' Grand Prix', ' Grand Prix') ?? weekend.slug}
      </div>
      <div className="font-mono text-[11px]" style={{ color: 'var(--pw-dim)' }}>
        {weekend.location}{weekend.country ? ` · ${weekend.country}` : ''}
        {weekend.event_date ? ` · ${weekend.event_date}` : ''}
      </div>

      <p className="font-mono text-[11px] leading-relaxed max-w-sm mt-1"
        style={{ color: 'var(--pw-dim)' }}>
        A full recorded weekend, played through the live timing path at real
        speed. Every tab works as it does during a session, because the data
        arrives the same way.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
        {sessions.map((s) => (
          <button
            key={s.key ?? s.label}
            type="button"
            onClick={() => start(s)}
            disabled={!ready || starting != null}
            className="font-mono text-[10px] tracking-wider uppercase px-2.5 py-1.5 border rounded-sm transition-colors disabled:opacity-40"
            style={{
              borderColor: s.kind === 'race' ? '#E10600' : 'var(--pw-border)',
              color: s.kind === 'race' ? 'var(--pw-text-strong)' : 'var(--pw-dim)',
              fontWeight: s.kind === 'race' ? 700 : 400,
            }}
          >
            {starting === s.label ? 'Loading…' : s.label === 'QUALIFYING' ? 'QUALI' : s.label}
          </button>
        ))}
      </div>

      {!ready && (
        <div className="font-mono text-[10px] mt-1" style={{ color: 'var(--pw-ghost)' }}>
          Waiting for the backend connection…
        </div>
      )}
    </div>
  )
}
