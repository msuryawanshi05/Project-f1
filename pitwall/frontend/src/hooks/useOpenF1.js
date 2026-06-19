/**
 * useOpenF1.js — PITWALL
 *
 * OpenF1 provides FREE historical data (2023+) — NO authentication needed.
 * Real-time data requires a paid subscription (not used here).
 *
 * During LIVE sessions: real-time data comes from F1 SignalR via our backend.
 * After sessions end: OpenF1 historical data used for strategy/telemetry analysis.
 *
 * All calls route through /api/openf1 backend proxy (avoids CORS issues).
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

// ── Check if OpenF1 is reachable (no auth needed) ────────────────────────────
export function useOpenF1Status() {
  const [reachable, setReachable] = useState(false)
  const [checked, setChecked]     = useState(false)

  useEffect(() => {
    // Ping OpenF1 with a lightweight query — historical sessions (always free)
    openf1Get('v1/sessions', { year: 2025, limit: 1 })
      .then(() => { setReachable(true);  setChecked(true) })
      .catch(() => { setReachable(false); setChecked(true) })
  }, [])

  return { reachable, checked }
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
export async function lookupSessionKey(year, roundNumber, sessionName) {
  try {
    const data = await openf1Get('v1/sessions', { year, session_name: sessionName })
    const match = data.find((s) => s.meeting_number === roundNumber || s.circuit_short_name)
    return match?.session_key ?? null
  } catch {
    return null
  }
}
