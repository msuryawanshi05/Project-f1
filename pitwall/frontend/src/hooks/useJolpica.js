import { useEffect, useState } from 'react'
import useF1Store from '../store/useF1Store'

const BASE = 'https://api.jolpi.ca/ergast/f1/2026'

export function useJolpica() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const { setCalendar, setStandings } = useF1Store()

  useEffect(() => {
    let cancelled = false

    async function fetchAll() {
      setLoading(true)
      setError(null)

      try {
        const [calRes, driverRes, ctorRes] = await Promise.all([
          fetch(`${BASE}.json`),
          fetch(`${BASE}/driverstandings.json`),
          fetch(`${BASE}/constructorstandings.json`),
        ])

        // Parse all three in parallel
        const [calData, driverData, ctorData] = await Promise.all([
          calRes.json(),
          driverRes.json(),
          ctorRes.json(),
        ])

        if (cancelled) return

        // Calendar
        const races = calData?.MRData?.RaceTable?.Races ?? []
        setCalendar(races)

        // Driver standings
        const driverStandings =
          driverData?.MRData?.StandingsTable?.StandingsLists?.[0]
            ?.DriverStandings ?? []

        // Constructor standings
        const ctorStandings =
          ctorData?.MRData?.StandingsTable?.StandingsLists?.[0]
            ?.ConstructorStandings ?? []

        setStandings(driverStandings, ctorStandings)

        console.debug(
          `[Jolpica] Loaded: ${races.length} races, ` +
          `${driverStandings.length} drivers, ` +
          `${ctorStandings.length} constructors`
        )
      } catch (err) {
        if (!cancelled) {
          console.error('[Jolpica] Fetch failed:', err)
          setError(err.message)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchAll()

    return () => {
      cancelled = true
    }
  }, [setCalendar, setStandings])

  return { loading, error }
}
