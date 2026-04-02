import { useState, useEffect, useCallback } from 'react'
import TyreIcon from '../ui/TyreIcon'

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast'
const WIKI_API   = 'https://en.wikipedia.org/api/rest_v1/page/summary/'

// Security: only wikimedia.org CDN URLs are allowed as image sources
const ALLOWED_THUMBNAIL_ORIGINS = new Set(['upload.wikimedia.org'])

function sanitiseThumbnailUrl(src) {
  if (!src || typeof src !== 'string') return null
  try {
    const url = new URL(src)
    if (url.protocol !== 'https:') return null
    if (!ALLOWED_THUMBNAIL_ORIGINS.has(url.hostname)) return null
    return src
  } catch (urlErr) {
    console.debug('[CircuitPanel] Invalid thumbnail URL:', urlErr.message)
    return null
  }
}

const IST_OFFSET = 330

function toIST(utcDateStr) {
  if (!utcDateStr) return '—'
  const d = new Date(utcDateStr)
  if (Number.isNaN(d.getTime())) return '—'
  const istMs = d.getTime() + IST_OFFSET * 60000
  const ist   = new Date(istMs)
  return ist.toUTCString().replace(' GMT', '').split(' ').slice(0, 5).join(' ')
}

function formatSession(dateStr, timeStr) {
  if (!dateStr) return { date: '—', ist: '—' }
  const fullISO = timeStr ? `${dateStr}T${timeStr}` : `${dateStr}T00:00:00Z`
  const d = new Date(fullISO)
  const dayStr = d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' }).toUpperCase()
  const istTime = new Date(d.getTime() + IST_OFFSET * 60000)
    .toISOString().slice(11, 16) + ' IST'
  return { date: dayStr, ist: istTime }
}

function weatherEmoji(precipProb) {
  if (precipProb > 70) return '🌧️'
  if (precipProb > 40) return '🌦️'
  if (precipProb > 20) return '⛅'
  return '☀️'
}

function StatRow({ label, value }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-[#1a1a1a]">
      <span className="font-mono text-[11px] text-[#555] tracking-wider">{label}</span>
      <span className="font-mono text-[11px] text-[#C0C0C0]">{value}</span>
    </div>
  )
}

function SkeletonLine({ w = 'w-full', h = 'h-3' }) {
  return <div className={`${w} ${h} bg-[#1a1a1a] rounded animate-pulse`} />
}

export default function CircuitDetailPanel({ race, circuitData, onClose }) {
  const [wiki, setWiki]       = useState(null)
  const [wikiLoading, setWikiLoading] = useState(false)
  const [forecast, setForecast] = useState(null)
  const [fcLoading, setFcLoading] = useState(false)

  const raceDate = race?.date ? new Date(race.date) : null
  const isPast   = raceDate ? raceDate < new Date() : false

  // Fetch Wikipedia circuit info
  const fetchWiki = useCallback(async () => {
    if (!circuitData?.wikipedia) return
    setWikiLoading(true)
    try {
      const res  = await fetch(`${WIKI_API}${circuitData.wikipedia}`)
      const data = await res.json()
      setWiki({
        extract:   data.extract ?? '',
        // Security: only allow URLs from the official Wikimedia CDN — reject any other origin
        thumbnail: sanitiseThumbnailUrl(data.thumbnail?.source),
        title:     data.title ?? circuitData?.circuit,
      })
    } catch (err) {
      console.debug('[CircuitPanel] Wikipedia fetch failed:', err.message)
      setWiki({ extract: 'Circuit information unavailable.', thumbnail: null, title: circuitData?.circuit })
    } finally {
      setWikiLoading(false)
    }
  }, [circuitData?.wikipedia, circuitData?.circuit])

  // Fetch 7-day weather forecast
  const fetchForecast = useCallback(async () => {
    if (!circuitData?.lat || !circuitData?.lng || isPast) return
    setFcLoading(true)
    try {
      const url = `${OPEN_METEO}?latitude=${circuitData.lat}&longitude=${circuitData.lng}&daily=precipitation_probability_max,temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&forecast_days=7`
      const res  = await fetch(url)
      const data = await res.json()
      setForecast(data.daily)
    } catch (err) {
      console.debug('[CircuitPanel] Weather fetch failed:', err.message)
      setForecast(null)
    } finally {
      setFcLoading(false)
    }
  }, [circuitData?.lat, circuitData?.lng, isPast])

  useEffect(() => {
    setWiki(null)
    setForecast(null)
    fetchWiki()
    fetchForecast()
  }, [fetchWiki, fetchForecast])

  // Build session schedule from race object
  const sessions = []
  if (race?.FirstPractice)  sessions.push({ label: 'FP1',         ...race.FirstPractice })
  if (race?.SecondPractice) sessions.push({ label: circuitData?.sprint ? 'SPRINT QUALI' : 'FP2', ...race.SecondPractice })
  if (race?.ThirdPractice)  sessions.push({ label: 'FP3',         ...race.ThirdPractice })
  if (race?.Sprint)         sessions.push({ label: 'SPRINT',      ...race.Sprint })
  if (race?.Qualifying)     sessions.push({ label: 'QUALIFYING',  ...race.Qualifying })
  sessions.push({ label: 'RACE', date: race?.date, time: race?.time })

  const raceName    = race?.raceName ?? circuitData?.name ?? 'Unknown GP'
  const circuitName = race?.Circuit?.circuitName ?? circuitData?.circuit ?? ''
  const raceLen     = circuitData
    ? (circuitData.laps * circuitData.length_km).toFixed(3)
    : '—'

  return (
    <div
      className="fixed top-[84px] right-0 bottom-0 z-40 overflow-y-auto bg-[#0a0a0a] border-l border-[#1e1e1e] shadow-2xl"
      style={{ width: 480 }}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0a0a0a] border-b border-[#1e1e1e] px-5 py-4 flex items-start justify-between gap-3">
        <div>
          <div className="font-display font-bold text-lg tracking-widest text-white uppercase leading-tight">
            {raceName}
          </div>
          <div className="font-mono text-[11px] text-[#555] mt-0.5">{circuitName}</div>
          <div className="flex items-center gap-2 mt-2">
            <span className="font-mono text-[10px] text-[#444] border border-[#252525] px-1.5 py-0.5">
              ROUND {circuitData?.round ?? race?.round ?? '?'} OF 24
            </span>
            {circuitData?.sprint && (
              <span className="font-mono text-[10px] text-[#C59B00] border border-[#C59B00]/30 px-1.5 py-0.5">
                SPRINT
              </span>
            )}
            {isPast && (
              <span className="font-mono text-[10px] text-[#444] border border-[#2a2a2a] px-1.5 py-0.5">
                COMPLETED
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-[#333] hover:text-[#666] font-mono text-sm leading-none mt-1 flex-shrink-0"
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      <div className="px-5 py-4 space-y-6">

        {/* Stats grid */}
        {circuitData && (
          <section>
            <div className="font-mono text-[10px] text-[#444] tracking-widest uppercase mb-2">Circuit Stats</div>
            <StatRow label="Circuit Length"  value={`${circuitData.length_km} km`} />
            <StatRow label="Race Distance"   value={`${raceLen} km`} />
            <StatRow label="Lap Count"       value={`${circuitData.laps} laps`} />
            <StatRow label="Lap Record"      value={`${circuitData.lap_record ?? '—'} — ${circuitData.lap_record_holder ?? '?'} (${circuitData.lap_record_year ?? '?'})`} />
            <StatRow label="DRS Zones"       value={circuitData.drs_zones ?? '—'} />
            <StatRow label="City"            value={`${circuitData.city}, ${circuitData.country}`} />
          </section>
        )}

        {/* Tyre compounds */}
        <section>
          <div className="font-mono text-[10px] text-[#444] tracking-widest uppercase mb-3">Pirelli Compounds</div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center gap-1">
              <TyreIcon compound="SOFT" />
              <span className="font-mono text-[9px] text-[#555]">SOFT</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <TyreIcon compound="MEDIUM" />
              <span className="font-mono text-[9px] text-[#555]">MEDIUM</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <TyreIcon compound="HARD" />
              <span className="font-mono text-[9px] text-[#555]">HARD</span>
            </div>
          </div>
        </section>

        {/* Session schedule */}
        {sessions.length > 0 && (
          <section>
            <div className="font-mono text-[10px] text-[#444] tracking-widest uppercase mb-2">Session Schedule</div>
            <div className="space-y-1">
              {sessions.map((s) => {
                const { date: dStr, ist } = formatSession(s.date, s.time)
                return (
                  <div key={s.label} className="flex items-center justify-between py-1.5 border-b border-[#1a1a1a]">
                    <span className="font-mono text-[10px] text-[#444] w-24">{dStr}</span>
                    <span className="font-mono text-[11px] text-[#888] flex-1 px-2">{s.label}</span>
                    <span className="font-mono text-[11px] text-[#C0C0C0]">{ist}</span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Wikipedia extract */}
        <section>
          <div className="font-mono text-[10px] text-[#444] tracking-widest uppercase mb-2">Circuit History</div>
          {wikiLoading ? (
            <div className="space-y-2">
              <SkeletonLine /><SkeletonLine w="w-3/4" />
            </div>
          ) : wiki ? (
            <div className="flex gap-3">
              {wiki.thumbnail && (
                <img
                  src={sanitiseThumbnailUrl(wiki.thumbnail) ?? ''}
                  alt={wiki.title ?? ''}
                  className="w-20 h-20 object-cover flex-shrink-0 border border-[#1e1e1e]"
                />
              )}
              <p className="font-body text-[11px] text-[#666] leading-relaxed">
                {wiki.extract.split('. ').slice(0, 3).join('. ')}.
              </p>
            </div>
          ) : (
            <div className="font-mono text-[11px] text-[#333]">No data available</div>
          )}
        </section>

        {/* Weather forecast */}
        <section>
          <div className="font-mono text-[10px] text-[#444] tracking-widest uppercase mb-2">Race Weekend Forecast</div>
          {isPast ? (
            <div className="font-mono text-[11px] text-[#333]">Race completed — no forecast</div>
          ) : fcLoading ? (
            <div className="flex gap-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex-1 bg-[#111] border border-[#1e1e1e] p-2 space-y-1.5">
                  <SkeletonLine h="h-2" /><SkeletonLine h="h-4" /><SkeletonLine h="h-2" />
                </div>
              ))}
            </div>
          ) : forecast ? (
            <div className="flex gap-1 overflow-x-auto">
              {(forecast.time ?? []).map((dayStr, i) => {
                const day    = new Date(dayStr).toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()
                const precip = forecast.precipitation_probability_max?.[i] ?? 0
                const tMax   = forecast.temperature_2m_max?.[i] ?? '?'
                const tMin   = forecast.temperature_2m_min?.[i] ?? '?'
                const emoji  = weatherEmoji(precip)
                return (
                  <div
                    key={dayStr}
                    className="flex-shrink-0 w-14 bg-[#0d0d0d] border border-[#1e1e1e] p-2 flex flex-col items-center gap-1"
                  >
                    <span className="font-mono text-[9px] text-[#444]">{day}</span>
                    <span className="text-lg leading-none">{emoji}</span>
                    <span className="font-mono text-[10px] text-[#C0C0C0]">{Math.round(tMax)}°</span>
                    <span className="font-mono text-[9px] text-[#444]">{Math.round(tMin)}°</span>
                    <span className="font-mono text-[9px] text-[#3671C6]">{precip}%</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="font-mono text-[11px] text-[#333]">Forecast unavailable</div>
          )}
        </section>

        {/* Replay stub (past races only) */}
        {isPast && (
          <section>
            <button
              disabled
              className="w-full py-2.5 font-mono text-[11px] tracking-widest border border-[#252525] text-[#333] cursor-not-allowed opacity-40"
            >
              SESSION REPLAY — COMING SOON
            </button>
          </section>
        )}
      </div>
    </div>
  )
}
