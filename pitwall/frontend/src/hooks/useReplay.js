import { useCallback, useEffect, useState } from 'react'
import useF1Store from '../store/useF1Store'

import { apiBase } from '../utils/apiBase'

/**
 * What this deployment can replay, and how to drive it.
 *
 * The catalogue is fetched once: a deployment built without replay data
 * reports `available: false` and the UI simply does not offer the feature,
 * rather than showing a button that fails.
 *
 * Commands go up the SAME WebSocket the live feed uses — `sendCommand` is
 * published to the store by useWebSocket when the socket opens. Nothing here
 * holds a socket of its own, because a second connection would be a second way
 * into the store and the two would drift.
 */
export function useReplayCatalogue() {
  const [catalogue, setCatalogue] = useState({ loading: true, available: false, weekends: [] })

  useEffect(() => {
    let cancelled = false
    const ctrl = new AbortController()
    fetch(`${apiBase()}/api/replay`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => {
        if (!cancelled) setCatalogue({ loading: false, available: Boolean(j.available), weekends: j.weekends ?? [] })
      })
      .catch(() => {
        // An older backend has no /api/replay. Not an error state — it just
        // means this deployment cannot replay anything.
        if (!cancelled) setCatalogue({ loading: false, available: false, weekends: [] })
      })
    return () => { cancelled = true; ctrl.abort() }
  }, [])

  return catalogue
}

/** The transport. Every call is a message on the live socket. */
export function useReplayControls() {
  const send = useF1Store((s) => s.sendCommand)
  const replay = useF1Store((s) => s.replay)

  const cmd = useCallback((payload) => { send?.(payload) }, [send])

  return {
    replay,
    ready: Boolean(send),
    load: useCallback((weekend, session, at = 0) =>
      cmd({ cmd: 'replay.load', weekend, session, at }), [cmd]),
    play: useCallback(() => cmd({ cmd: 'replay.play' }), [cmd]),
    pause: useCallback(() => cmd({ cmd: 'replay.pause' }), [cmd]),
    setSpeed: useCallback((speed) => cmd({ cmd: 'replay.speed', speed }), [cmd]),
    seek: useCallback((at) => cmd({ cmd: 'replay.seek', at }), [cmd]),
    nextEvent: useCallback(() => cmd({ cmd: 'replay.next_event' }), [cmd]),
    exit: useCallback(() => cmd({ cmd: 'replay.exit' }), [cmd]),
  }
}

/**
 * The scrub bar's event markers for the loaded session.
 *
 * Markers live in the stream file, which the backend holds but does not expose
 * wholesale — the client has no business downloading 2,400 events to draw
 * twelve ticks. They ride on the manifest's per-session summary instead, so
 * this reads them from the catalogue rather than fetching anything.
 */
export function useReplayMarkers(weekend, session) {
  const [markers, setMarkers] = useState([])

  useEffect(() => {
    if (!weekend || !session) { setMarkers([]); return }
    let cancelled = false
    const ctrl = new AbortController()
    fetch(`${apiBase()}/api/replay/${weekend}/${session}/markers`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => { if (!cancelled) setMarkers(j.markers ?? []) })
      .catch(() => { if (!cancelled) setMarkers([]) })
    return () => { cancelled = true; ctrl.abort() }
  }, [weekend, session])

  return markers
}

/**
 * One driver's recorded telemetry for the loaded replay session.
 *
 * Fetched per driver and only when a driver is selected: car telemetry is the
 * one expensive stream in a replay, and a viewer looks at two cars of it.
 * Results are cached for the session so flipping between drivers is instant.
 */
const telemetryCache = new Map()

export function useReplayTelemetry(weekend, session, driverNumber) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!weekend || !session || !driverNumber) { setData(null); return }
    const key = `${weekend}/${session}/${driverNumber}`
    if (telemetryCache.has(key)) { setData(telemetryCache.get(key)); return }

    let cancelled = false
    const ctrl = new AbortController()
    setLoading(true)
    fetch(`${apiBase()}/api/replay/${weekend}/${session}/telemetry/${driverNumber}`,
      { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => {
        telemetryCache.set(key, j)
        if (!cancelled) { setData(j); setLoading(false) }
      })
      .catch(() => { if (!cancelled) { setData(null); setLoading(false) } })
    return () => { cancelled = true; ctrl.abort() }
  }, [weekend, session, driverNumber])

  return { data, loading }
}

/** Every driver's fastest lap on a common distance axis, for compare mode. */
const fastestCache = new Map()

export function useReplayFastestLaps(weekend, session) {
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!weekend || !session) { setData(null); return }
    const key = `${weekend}/${session}`
    if (fastestCache.has(key)) { setData(fastestCache.get(key)); return }

    let cancelled = false
    const ctrl = new AbortController()
    fetch(`${apiBase()}/api/replay/${weekend}/${session}/fastest-laps`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => { fastestCache.set(key, j); if (!cancelled) setData(j) })
      .catch(() => { if (!cancelled) setData(null) })
    return () => { cancelled = true; ctrl.abort() }
  }, [weekend, session])

  return data
}

export default useReplayControls
