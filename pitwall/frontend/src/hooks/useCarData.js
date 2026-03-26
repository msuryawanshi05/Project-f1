import { useState, useEffect, useRef } from 'react'

const OPENF1_BASE = 'https://api.openf1.org/v1'

/**
 * Fetches car telemetry data from OpenF1 for a given driver.
 * Polls every 4 seconds during a live session.
 * Falls back to a fixed past session for testing when not live.
 *
 * @param {number|string} driverNumber
 * @param {string|number} sessionKey  - null = use latest
 * @param {boolean} isLive
 */
export function useCarData(driverNumber, sessionKey = null, isLive = false) {
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!driverNumber) { setData([]); return }

    const key  = sessionKey ?? 'latest'
    const url  = `${OPENF1_BASE}/car_data?driver_number=${driverNumber}&session_key=${key}&speed%3E100=true`

    async function fetchData() {
      setLoading(true)
      try {
        const res  = await fetch(url)
        const json = await res.json()
        if (Array.isArray(json)) {
          // Keep last 300 data points (~2 laps) for chart performance
          setData(json.slice(-300))
        }
      } catch {
        // Network error — keep last data
      } finally {
        setLoading(false)
      }
    }

    fetchData()

    // Poll every 4s when live
    if (isLive) {
      timerRef.current = setInterval(fetchData, 4000)
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [driverNumber, sessionKey, isLive])

  return { data, loading }
}
