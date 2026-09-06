import { useEffect, useState } from 'react'
import useF1Store from '../store/useF1Store'

const BASE = 'https://api.jolpi.ca/ergast/f1/2026'
const CACHE_KEY = 'pitwall_jolpica_2026'
const CACHE_TTL = 30 * 60 * 1000  // 30 minutes

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) return null
    return data
  } catch {
    return null
  }
}

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }))
  } catch { /* storage full — ignore */ }
}

function fetchWithTimeout(url, ms = 8000) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(id))
}

export function useJolpica() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const { setCalendar, setStandings } = useF1Store()

  useEffect(() => {
    let cancelled = false

    // Load from cache immediately so UI isn't blank
    const cached = readCache()
    if (cached) {
      setCalendar(cached.races)
      setStandings(cached.driverStandings, cached.ctorStandings)
      setLoading(false)
    }

    async function fetchAll() {
      try {
        const [calRes, driverRes, ctorRes] = await Promise.all([
          fetchWithTimeout(`${BASE}.json`),
          fetchWithTimeout(`${BASE}/driverstandings.json`),
          fetchWithTimeout(`${BASE}/constructorstandings.json`),
        ])

        const [calData, driverData, ctorData] = await Promise.all([
          calRes.json(),
          driverRes.json(),
          ctorRes.json(),
        ])

        if (cancelled) return

        const races = calData?.MRData?.RaceTable?.Races ?? []
        const driverStandings =
          driverData?.MRData?.StandingsTable?.StandingsLists?.[0]
            ?.DriverStandings ?? []
        const ctorStandings =
          ctorData?.MRData?.StandingsTable?.StandingsLists?.[0]
            ?.ConstructorStandings ?? []

        setCalendar(races)
        setStandings(driverStandings, ctorStandings)
        writeCache({ races, driverStandings, ctorStandings })
      } catch (err) {
        if (!cancelled && !cached) {
          // Only show error if we had no cache to fall back on
          setError(err.message)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchAll()

    return () => { cancelled = true }
  }, [setCalendar, setStandings])

  return { loading, error }
}
