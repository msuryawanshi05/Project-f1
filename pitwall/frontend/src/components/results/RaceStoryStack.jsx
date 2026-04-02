import { useState, useEffect, useRef, useCallback } from 'react'

// Notable race control events to surface in the story
const NOTABLE_FLAGS = new Set(['SC', 'VSC', 'RED', 'CHEQUERED', 'BLACK AND WHITE', 'BLACK', 'YELLOW'])

const EVENT_ICONS = {
  SC:               '🟡',
  VSC:              '🟡',
  RED:              '🔴',
  CHEQUERED:        '🏁',
  'BLACK AND WHITE': '⬛',
  BLACK:            '⬛',
  YELLOW:           '🟡',
  pit:              '🔧',
  fastest:          '⚡',
  default:          '📋',
}

function getIcon(flag, category) {
  if (flag && EVENT_ICONS[flag]) return EVENT_ICONS[flag]
  if (category?.toLowerCase() === 'fastest lap') return EVENT_ICONS.fastest
  return EVENT_ICONS.default
}

function buildFallbackStory(raceData) {
  const events = []
  const results = raceData?.Results ?? []
  if (results[0]) {
    const d = results[0].Driver ?? {}
    events.push({ icon: '🏁', lap: null, title: 'RACE WINNER', desc: `${d.code ?? d.familyName} takes the victory` })
  }
  const fl = results.find((r) => r.FastestLap?.rank === '1')
  if (fl) {
    const d = fl.Driver ?? {}
    events.push({ icon: '⚡', lap: fl.FastestLap?.lap, title: 'FASTEST LAP', desc: `${d.code ?? d.familyName} — ${fl.FastestLap?.Time?.time ?? '?'}` })
  }
  const dnfs = results.filter((r) => !['Finished','+1 Lap','+2 Laps'].includes(r.status) && !r.status?.startsWith('+'))
  dnfs.slice(0, 3).forEach((r) => {
    const d = r.Driver ?? {}
    events.push({ icon: '🔧', lap: null, title: 'RETIREMENT', desc: `${d.code ?? d.familyName} — ${r.status}` })
  })
  return events
}

function StoryCard({ event, index, total }) {
  return (
    <div className="flex flex-col gap-3 p-4 bg-[#0d0d0d] border border-[#1e1e1e] w-full">
      {/* Lap badge */}
      {event.lap && (
        <div className="font-mono text-[10px] text-[#444] tracking-widest">
          LAP {event.lap}
        </div>
      )}
      {/* Icon + title */}
      <div className="flex items-center gap-2">
        <span className="text-2xl leading-none">{event.icon}</span>
        <span className="font-mono text-sm font-bold tracking-widest text-white">{event.title}</span>
      </div>
      {/* Description */}
      <p className="font-body text-xs text-[#666] leading-relaxed">{event.desc}</p>
      {/* Slide indicator */}
      <div className="flex gap-1 mt-1">
        {[...Array(total)].map((_, i) => (
          <div
            key={i}
            className="h-[2px] flex-1 rounded-full transition-colors duration-300"
            style={{ backgroundColor: i === index ? '#E8002D' : '#252525' }}
          />
        ))}
      </div>
    </div>
  )
}

export default function RaceStoryStack({ raceData, sessionKey, onClose }) {
  const [events, setEvents]   = useState([])
  const [loading, setLoading] = useState(true)
  const [current, setCurrent] = useState(0)
  const autoRef = useRef(null)
  const [progress, setProgress] = useState(0)
  const progressInterval = useRef(null)
  const INTERVAL_MS = 4000

  const resetTimer = useCallback(() => {
    setProgress(0)
    clearInterval(progressInterval.current)
    progressInterval.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) return 100
        return p + (100 / (INTERVAL_MS / 100))
      })
    }, 100)
  }, [])

  // Fetch from OpenF1 race_control if sessionKey available, otherwise use fallback
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)

      let story = []
      if (sessionKey) {
        try {
          const res  = await fetch(`https://api.openf1.org/v1/race_control?session_key=${sessionKey}`)
          const data = await res.json()
          const notable = data.filter((m) =>
            (m.category === 'Flag' && NOTABLE_FLAGS.has(m.flag)) ||
            m.category === 'SafetyCar'
          ).slice(0, 8)

          story = notable.map((m) => ({
            icon: getIcon(m.flag, m.category),
            lap:  m.lap_number ?? null,
            title: m.flag ?? m.category ?? 'RACE CONTROL',
            desc:  m.message ?? `${m.flag} flag — Lap ${m.lap_number ?? '?'}`,
          }))
        } catch (_) {
          story = []
        }
      }

      // Supplement / fallback with results-derived events
      if (story.length < 3) {
        story = [...story, ...buildFallbackStory(raceData)].slice(0, 8)
      }

      if (!cancelled) {
        setEvents(story.length ? story : buildFallbackStory(raceData))
        setLoading(false)
        setCurrent(0)
        resetTimer()
      }
    }

    load()
    return () => { cancelled = true; clearInterval(progressInterval.current) }
  }, [sessionKey, raceData, resetTimer])

  // Auto-advance
  useEffect(() => {
    if (!events.length) return
    clearInterval(autoRef.current)
    autoRef.current = setInterval(() => {
      setCurrent((c) => {
        const next = (c + 1) % events.length
        resetTimer()
        return next
      })
    }, INTERVAL_MS)
    return () => clearInterval(autoRef.current)
  }, [events, resetTimer])

  const goTo = (idx) => {
    clearInterval(autoRef.current)
    setCurrent(idx)
    resetTimer()
  }

  if (loading) {
    return (
      <div className="mt-4 border border-[#1e1e1e] p-4 bg-[#0d0d0d]">
        <div className="flex items-center gap-2 font-mono text-[11px] text-[#444]">
          <span className="animate-spin inline-block w-3 h-3 border border-[#333] border-t-[#666] rounded-full" />
          Loading race story…
        </div>
      </div>
    )
  }

  if (!events.length) return null

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[10px] text-[#444] tracking-widest uppercase">Race Story</span>
        <button
          onClick={onClose}
          className="font-mono text-[10px] text-[#333] hover:text-[#666]"
        >
          ✕ Close
        </button>
      </div>

      {/* Card */}
      <StoryCard event={events[current]} index={current} total={events.length} />

      {/* Progress bar */}
      <div className="h-px bg-[#1a1a1a] mt-2 overflow-hidden">
        <div
          className="h-full bg-status-red transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Nav buttons */}
      <div className="flex items-center justify-between mt-2">
        <button
          onClick={() => goTo((current - 1 + events.length) % events.length)}
          className="font-mono text-[10px] text-[#444] hover:text-[#888] px-2 py-1 border border-[#252525] transition-colors"
        >
          ← PREV
        </button>
        <span className="font-mono text-[10px] text-[#333]">
          {current + 1} / {events.length}
        </span>
        <button
          onClick={() => goTo((current + 1) % events.length)}
          className="font-mono text-[10px] text-[#444] hover:text-[#888] px-2 py-1 border border-[#252525] transition-colors"
        >
          NEXT →
        </button>
      </div>
    </div>
  )
}
