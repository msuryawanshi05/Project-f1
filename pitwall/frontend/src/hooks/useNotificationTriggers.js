import { useEffect, useRef } from 'react'
import useF1Store from '../store/useF1Store'
import { sounds } from '../utils/notificationSounds'

/**
 * useNotificationTriggers — Phase 7 hardened version
 *
 * Changes from Phase 6:
 * - Unified `lastNotified` ref with Set-based per-driver guards
 * - Pit stop: live timer notification (fires addNotification with live:true, then
 *   updateNotification on pit_out with final elapsed time)
 * - All triggers have explicit dedup guards (no double-fires)
 * - Sound fired immediately after each addNotification
 * - DEV: exposes store as window.__pitwall_store
 */
export default function useNotificationTriggers() {
  const trackStatus     = useF1Store((s) => s.trackStatus)
  const raceControl     = useF1Store((s) => s.raceControl)
  const timing          = useF1Store((s) => s.timing)
  const weather         = useF1Store((s) => s.weather)
  const session         = useF1Store((s) => s.session)
  const addNotification = useF1Store((s) => s.addNotification)
  const updateNotification = useF1Store((s) => s.updateNotification)

  // ── Deduplication refs ────────────────────────────────────────────────────
  const lastTrackStatus = useRef(null)     // last status string we notified on
  const prevRCLength    = useRef(0)
  const prevPhase       = useRef(null)
  const prevRainfall    = useRef(null)
  const prevFastestKey  = useRef(null)     // "driverNum-lapTime" string
  // Per-driver sets (fire once per driver per event, never repeated)
  const retiredDrivers  = useRef(new Set())
  // Pit timers: { [driverNumber]: { startMs, notifId } }
  const pitTimers       = useRef({})
  // Previous in_pit state per driver
  const prevInPit       = useRef({})
  // DRS cooldown: track last message text to avoid duplicates
  const lastDrsMsg      = useRef(null)

  // ── DEV: expose store to console ─────────────────────────────────────────
  useEffect(() => {
    if (import.meta.env.DEV) {
      globalThis.__pitwall_store = useF1Store.getState()
    }
  }, [])

  // ── 1. Track status ───────────────────────────────────────────────────────
  useEffect(() => {
    const status = trackStatus?.status
    if (!status || status === lastTrackStatus.current) return
    const prev = lastTrackStatus.current
    lastTrackStatus.current = status

    if (prev === null) return  // don't fire on cold start

    if (status === '4') {
      addNotification({ type: 'critical', event: 'safety_car', title: 'SAFETY CAR', message: `Deployed — Lap ${session.lap ?? '?'}` })
      sounds.critical()
    } else if (status === '5') {
      addNotification({ type: 'critical', event: 'red_flag', title: 'RED FLAG', message: `Session stopped — Lap ${session.lap ?? '?'}` })
      sounds.critical()
    } else if (status === '6') {
      addNotification({ type: 'high', event: 'vsc', title: 'VIRTUAL SAFETY CAR', message: `Deployed — Lap ${session.lap ?? '?'}` })
      sounds.high()
    } else if (status === '1' && ['4', '5', '6'].includes(prev)) {
      // Reset guard so SC can fire again later in race if redeployed
      addNotification({ type: 'teal', event: 'green_flag', title: 'GREEN FLAG', message: 'Track clear — racing resumed' })
      sounds.teal()
      // Allow future SC notifications
      lastTrackStatus.current = '1'
    }
  }, [trackStatus, session.lap, addNotification])

  // ── 2. Race control messages (DRS, penalties) ─────────────────────────────
  useEffect(() => {
    const newCount = raceControl.length - prevRCLength.current
    if (newCount <= 0) {
      prevRCLength.current = raceControl.length
      return
    }
    prevRCLength.current = raceControl.length

    raceControl.slice(0, newCount).forEach((msg) => {
      const cat = (msg.category ?? '').toLowerCase()
      const txt = msg.message ?? ''

      // DRS — deduplicate by message text
      if (cat === 'drs' && txt !== lastDrsMsg.current) {
        lastDrsMsg.current = txt
        const on = txt.toLowerCase().includes('enabled')
        addNotification({ type: 'blue', event: 'drs', title: on ? 'DRS ENABLED' : 'DRS DISABLED', message: txt || (on ? 'DRS zones active' : 'DRS zones closed') })
        sounds.blue()
        return
      }

      // Driver penalty
      if (cat === 'flag' && msg.scope === 'Driver' && msg.driver_number) {
        addNotification({ type: 'high', event: 'penalty', title: 'PENALTY', message: `#${msg.driver_number} — ${txt}`, driverNumber: msg.driver_number })
        sounds.high()
      }
    })
  }, [raceControl, addNotification])

  // ── 3. Pit stops (live timer) ─────────────────────────────────────────────
  useEffect(() => {
    if (!timing.length) return

    timing.forEach((d) => {
      const key = d.number
      const wasInPit = prevInPit.current[key]

      // Entered pit lane
      if (d.in_pit && !wasInPit && !pitTimers.current[key]) {
        const notifId = Date.now() + key   // unique per driver
        pitTimers.current[key] = { startMs: Date.now(), notifId }
        addNotification({
          id: notifId,
          type: 'high', event: 'pit_stop',
          title: 'PIT STOP',
          message: `#${key} — in pit lane`,
          driverNumber: key,
          live: true,
        })
        sounds.high()
      }

      // Exited pit lane (pit_out flag)
      if (d.pit_out && pitTimers.current[key]) {
        const elapsed = ((Date.now() - pitTimers.current[key].startMs) / 1000).toFixed(1)
        updateNotification(pitTimers.current[key].notifId, {
          message: `#${key} — ${elapsed}s stop`,
          live: false,
        })
        delete pitTimers.current[key]
      }

      prevInPit.current[key] = d.in_pit
    })
  }, [timing, addNotification, updateNotification])

  // ── 4. Driver retirement (fires once per driver per session) ──────────────
  useEffect(() => {
    if (!timing.length) return
    timing.forEach((d) => {
      if (d.stopped && !retiredDrivers.current.has(d.number)) {
        retiredDrivers.current.add(d.number)
        addNotification({ type: 'critical', event: 'retirement', title: 'RETIREMENT', message: `#${d.number} has retired`, driverNumber: d.number })
        sounds.critical()
      }
    })
  }, [timing, addNotification])

  // Reset retirement set when session changes
  useEffect(() => {
    retiredDrivers.current.clear()
    pitTimers.current = {}
    prevInPit.current = {}
    lastDrsMsg.current = null
  }, [session.name])

  // ── 5. Fastest lap ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!timing.length) return
    const fastest = timing.find((d) => d.overall_fastest)
    if (!fastest) return
    const key = `${fastest.number}-${fastest.last_lap}`
    if (key === prevFastestKey.current) return
    prevFastestKey.current = key
    addNotification({ type: 'medium', event: 'fastest_lap', title: 'FASTEST LAP', message: `#${fastest.number} — ${fastest.last_lap ?? '?'}`, driverNumber: fastest.number })
    sounds.medium()
  }, [timing, addNotification])

  // ── 6. Rain ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (weather === null) return
    if (prevRainfall.current === null) { prevRainfall.current = weather.rainfall; return }
    if (!prevRainfall.current && weather.rainfall) {
      addNotification({ type: 'teal', event: 'rain', title: 'RAIN DETECTED', message: `Track temp ${weather.track_temp ?? '?'}°C` })
      sounds.teal()
    }
    prevRainfall.current = weather.rainfall
  }, [weather, addNotification])

  // ── 7. Chequered flag ─────────────────────────────────────────────────────
  useEffect(() => {
    if (prevPhase.current === null) { prevPhase.current = session.phase; return }
    if (prevPhase.current !== 'FINISHED' && session.phase === 'FINISHED') {
      addNotification({ type: 'critical', event: 'chequered', title: 'CHEQUERED FLAG', message: 'Session complete' })
      sounds.chequered()
    }
    prevPhase.current = session.phase
  }, [session.phase, addNotification])
}
