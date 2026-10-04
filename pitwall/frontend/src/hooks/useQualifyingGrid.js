import { useState, useEffect } from 'react'

const BASE = 'https://api.jolpi.ca/ergast/f1/2026'
const CACHE_TTL = 30 * 60 * 1000 // 30 mins

export function parseLapTimeToSeconds(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null
  const clean = timeStr.trim()
  const parts = clean.split(':')
  if (parts.length === 2) {
    const mins = parseFloat(parts[0])
    const secs = parseFloat(parts[1])
    if (isNaN(mins) || isNaN(secs)) return null
    return mins * 60 + secs
  }
  const s = parseFloat(clean)
  return isNaN(s) ? null : s
}

export function useQualifyingGrid(round) {
  const [grid, setGrid] = useState([])
  const [raceInfo, setRaceInfo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!round) {
      setGrid([])
      setRaceInfo(null)
      setLoading(false)
      return
    }

    let cancelled = false
    const cacheKey = `pitwall_quali_2026_r${round}`

    // 1. Read from localStorage cache
    try {
      const raw = localStorage.getItem(cacheKey)
      if (raw) {
        const { ts, data, info } = JSON.parse(raw)
        if (Date.now() - ts < CACHE_TTL && Array.isArray(data) && data.length > 0) {
          setGrid(data)
          setRaceInfo(info)
        }
      }
    } catch {
      // ignore storage errors
    }

    setLoading(true)
    setError(null)

    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), 9000)

    async function fetchQualifying() {
      try {
        const res = await fetch(`${BASE}/${round}/qualifying.json`, { signal: ctrl.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()

        if (cancelled) return

        const raceData = json?.MRData?.RaceTable?.Races?.[0]
        const rawResults = raceData?.QualifyingResults ?? []

        if (!rawResults.length) {
          if (!cancelled) {
            setLoading(false)
          }
          return
        }

        // Determine pole lap time in seconds
        const p1Best = rawResults[0]?.Q3 || rawResults[0]?.Q2 || rawResults[0]?.Q1 || null
        const poleSecs = parseLapTimeToSeconds(p1Best)

        const processed = rawResults.map((q, idx) => {
          const pos = Number(q.position ?? idx + 1)
          const best = q.Q3 || q.Q2 || q.Q1 || null
          let gapToPole = '—'

          if (pos === 1) {
            gapToPole = 'POLE'
          } else if (best && poleSecs != null) {
            const bestSecs = parseLapTimeToSeconds(best)
            if (bestSecs != null) {
              const diff = bestSecs - poleSecs
              gapToPole = diff >= 0 ? `+${diff.toFixed(3)}` : '—'
            }
          }

          return {
            position: pos,
            number: String(q.number ?? ''),
            code: q.Driver?.code || q.Driver?.familyName?.substring(0, 3).toUpperCase() || 'DRV',
            givenName: q.Driver?.givenName ?? '',
            familyName: q.Driver?.familyName ?? '',
            fullName: `${q.Driver?.givenName ?? ''} ${q.Driver?.familyName ?? ''}`.trim(),
            driverId: q.Driver?.driverId ?? '',
            nationality: q.Driver?.nationality ?? '',
            constructorId: q.Constructor?.constructorId ?? '',
            constructorName: q.Constructor?.name ?? '',
            q1: q.Q1 || null,
            q2: q.Q2 || null,
            q3: q.Q3 || null,
            bestTime: best,
            gapToPole,
          }
        })

        const info = {
          raceName: raceData?.raceName ?? `Round ${round}`,
          circuitName: raceData?.Circuit?.circuitName ?? '',
          date: raceData?.date ?? '',
        }

        if (!cancelled) {
          setGrid(processed)
          setRaceInfo(info)
          setLoading(false)
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: processed, info }))
          } catch {
            // ignore
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      } finally {
        clearTimeout(timeoutId)
      }
    }

    fetchQualifying()

    return () => {
      cancelled = true
      ctrl.abort()
      clearTimeout(timeoutId)
    }
  }, [round])

  return { grid, raceInfo, loading, error }
}
