/**
 * useOpenF1.js — PITWALL
 *
 * Fetches live/recent data from OpenF1 via the PITWALL backend proxy.
 * The proxy injects the API key server-side — no key exposed in frontend.
 *
 * Usage:
 *   const { stints, positions, hasKey, loading } = useOpenF1(sessionKey)
 *
 * All fetches are no-op if sessionKey is null or hasKey is false.
 */

import { useState, useEffect, useRef, useCallback } from 'react'

const PROXY = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000') + '/api/openf1'

// ── Fetch helper (GET via proxy) ──────────────────────────────────────────────
async function openf1Get(path, params = {}) {
  const url = new URL(`${PROXY}/${path}`)
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, v)
  })
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`OpenF1 ${path} → HTTP ${res.status}`)
  return res.json()
}

// ── Stint + compound data ─────────────────────────────────────────────────────
export function useOpenF1Stints(sessionKey) {
  const [stints, setStints]   = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!sessionKey) return
    let cancelled = false
    setLoading(true)
    openf1Get('v1/stints', { session_key: sessionKey })
      .then((data) => { if (!cancelled) setStints(Array.isArray(data) ? data : []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sessionKey])

  return { stints, loading }
}

// ── Live car positions ────────────────────────────────────────────────────────
export function useOpenF1Positions(sessionKey, pollMs = 2000) {
  const [positions, setPositions] = useState([])
  const timerRef = useRef(null)

  const fetch_ = useCallback(async () => {
    if (!sessionKey) return
    try {
      const data = await openf1Get('v1/location', {
        session_key: sessionKey,
        // Get only the latest batch — last 5 seconds
      })
      if (Array.isArray(data) && data.length) {
        // Latest position per driver
        const latest = {}
        for (const d of data) {
          latest[d.driver_number] = d
        }
        setPositions(Object.values(latest))
      }
    } catch (_) {}
  }, [sessionKey])

  useEffect(() => {
    if (!sessionKey) return
    fetch_()
    timerRef.current = setInterval(fetch_, pollMs)
    return () => clearInterval(timerRef.current)
  }, [sessionKey, pollMs, fetch_])

  return positions
}

// ── Driver radio messages ─────────────────────────────────────────────────────
export function useOpenF1Radio(sessionKey) {
  const [radio, setRadio]     = useState([])
  const [loading, setLoading] = useState(false)
  const seenRef = useRef(new Set())

  useEffect(() => {
    if (!sessionKey) return
    let cancelled = false
    setLoading(true)
    openf1Get('v1/team_radio', { session_key: sessionKey })
      .then((data) => {
        if (cancelled) return
        if (!Array.isArray(data)) return
        const fresh = data.filter((r) => !seenRef.current.has(r.date + r.driver_number))
        fresh.forEach((r) => seenRef.current.add(r.date + r.driver_number))
        setRadio((prev) => [...fresh.reverse(), ...prev].slice(0, 50))
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sessionKey])

  return { radio, loading }
}

// ── Check if OpenF1 key is configured ────────────────────────────────────────
export function useOpenF1Status() {
  const [hasKey, setHasKey] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    const base = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
    fetch(`${base}/api/openf1/status`)
      .then((r) => r.json())
      .then((d) => { setHasKey(!!d.has_key); setChecked(true) })
      .catch(() => setChecked(true))
  }, [])

  return { hasKey, checked }
}

// ── Combined hook (main entry point) ─────────────────────────────────────────
export function useOpenF1(sessionKey) {
  const { hasKey, checked } = useOpenF1Status()
  const { stints, loading: stintsLoading } = useOpenF1Stints(hasKey ? sessionKey : null)
  const positions = useOpenF1Positions(hasKey ? sessionKey : null, 2000)

  return {
    hasKey,
    checked,
    stints,
    positions,
    loading: stintsLoading,
  }
}
