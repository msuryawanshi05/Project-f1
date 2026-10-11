/**
 * useOpenF1.js — PITWALL
 *
 * OpenF1's historical endpoints are FREE and need no API key. Verified
 * 2026-10-11 against live 2026 sessions: /drivers (incl. headshot_url), /laps
 * (incl. 8-10 mini-sector statuses + i1/i2/st speeds), /stints, /pit (incl.
 * lane_duration), /location (GPS x/y/z at ~3.3 Hz), /intervals, /position,
 * /session_result and /team_radio all return 200.
 *
 * A previous revision asserted "OpenF1 requires a paid subscription (401)" and
 * stubbed these hooks out. That was incorrect and disabled the richest data
 * source in the project. Real-time streaming still comes from F1 SignalR; use
 * OpenF1 for post-session, replay and reference data.
 *
 * All calls route through the /api/openf1 backend proxy (avoids browser CORS).
 * Pass a REAL OpenF1 session key (store.currentSessionKey) — never a round
 * number; OpenF1 answers unknown keys with 404.
 */

import { useState, useEffect, useRef, useCallback } from 'react'

const PROXY = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000') + '/api/openf1'

// ── Generic fetch via proxy ───────────────────────────────────────────────────
async function openf1Get(path, params = {}) {
  const url = new URL(`${PROXY}/${path}`)
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, v)
  })
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`OpenF1 ${path} → HTTP ${res.status}`)
  return res.json()
}

// ── Check if OpenF1 is reachable ─────────────────────────────────────────────
// Probes the backend once per mount. Previously hardcoded `false`, which made
// the Live page permanently display OpenF1 as unavailable.
export function useOpenF1Status() {
  const [state, setState] = useState({ reachable: false, checked: false })

  useEffect(() => {
    let cancelled = false
    const base = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
    fetch(`${base}/api/openf1/status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled) setState({ reachable: Boolean(j?.reachable), checked: true })
      })
      .catch(() => { if (!cancelled) setState({ reachable: false, checked: true }) })
    return () => { cancelled = true }
  }, [])

  return state
}

// ── Historical stints (post-session strategy analysis) ────────────────────────
// Use this AFTER a session ends to get compound + lap data for strategy view.
// Do NOT use during live sessions — SignalR provides live tyre data instead.
export function useOpenF1Stints(sessionKey) {
  const [stints, setStints]   = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  useEffect(() => {
    if (!sessionKey) { setStints([]); return }
    let cancelled = false
    setLoading(true); setError(null)
    openf1Get('v1/stints', { session_key: sessionKey })
      .then((data) => { if (!cancelled) setStints(Array.isArray(data) ? data : []) })
      .catch((e)   => { if (!cancelled) setError(e.message) })
      .finally(()  => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sessionKey])

  return { stints, loading, error }
}

// ── Historical car telemetry (speed, throttle, brake, gear) ──────────────────
// Post-session only — fetches per driver per lap for Telemetry tab.
export function useOpenF1CarData(sessionKey, driverNumber, lap) {
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!sessionKey || !driverNumber || !lap) { setData([]); return }
    let cancelled = false
    setLoading(true)
    openf1Get('v1/car_data', {
      session_key:   sessionKey,
      driver_number: driverNumber,
      lap_number:    lap,
    })
      .then((d) => { if (!cancelled) setData(Array.isArray(d) ? d : []) })
      .catch(()  => { if (!cancelled) setData([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sessionKey, driverNumber, lap])

  return { data, loading }
}

// ── Historical driver radio ───────────────────────────────────────────────────
export function useOpenF1Radio(sessionKey) {
  const [radio, setRadio]     = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!sessionKey) { setRadio([]); return }
    let cancelled = false
    setLoading(true)
    openf1Get('v1/team_radio', { session_key: sessionKey })
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          setRadio([...data].reverse().slice(0, 50))
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sessionKey])

  return { radio, loading }
}

// ── Historical lap data ───────────────────────────────────────────────────────
export function useOpenF1Laps(sessionKey, driverNumber) {
  const [laps, setLaps]       = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!sessionKey) { setLaps([]); return }
    let cancelled = false
    setLoading(true)
    const params = { session_key: sessionKey }
    if (driverNumber) params.driver_number = driverNumber
    openf1Get('v1/laps', params)
      .then((d) => { if (!cancelled) setLaps(Array.isArray(d) ? d : []) })
      .catch(() => { if (!cancelled) setLaps([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sessionKey, driverNumber])

  return { laps, loading }
}

// ── Session lookup (find OpenF1 session_key for a given round/session) ────────
/**
 * Find an OpenF1 session_key for a given year + circuit + session name.
 *
 * Keyed on circuitShortName, not round: OpenF1 has no round field, and the old
 * implementation matched `s.meeting_number === roundNumber || s.circuit_short_name`
 * — the right-hand side is a non-empty string, so it was always truthy and the
 * function returned the FIRST session of the year regardless of input.
 *
 * Prefer store.currentSessionKey (resolved server-side) where available.
 */
export async function lookupSessionKey(year, circuitShortName, sessionName) {
  if (!year || !circuitShortName || !sessionName) return null
  try {
    const data = await openf1Get('v1/sessions', { year, session_name: sessionName })
    if (!Array.isArray(data)) return null
    const want = String(circuitShortName).toLowerCase()
    const match = data.find((s) => {
      const have = String(s.circuit_short_name ?? '').toLowerCase()
      return have && (have === want || have.includes(want) || want.includes(have))
    })
    return match?.session_key ?? null
  } catch {
    return null
  }
}
