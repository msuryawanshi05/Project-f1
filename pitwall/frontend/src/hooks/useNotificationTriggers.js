import { useEffect, useRef } from 'react'
import useF1Store from '../store/useF1Store'

/**
 * useNotificationTriggers
 *
 * Watches Zustand store values and fires addNotification() when trigger
 * conditions are met. Mount this hook once in App.jsx or AppShell.jsx.
 *
 * Triggers:
 *   1.  trackStatus "4"   → Safety Car
 *   2.  trackStatus "5"   → Red Flag
 *   3.  trackStatus "6"   → Virtual Safety Car
 *   4.  New race control SC/flag message → reinforces track status
 *   5.  Driver retirement  → timing driver stopped === true
 *   6.  Pit stop entry     → timing in_pit transition false → true
 *   7.  Fastest lap        → timing personal_fastest flag set
 *   8.  DRS enabled/disabled → race control Drs category
 *   9.  Weather change     → rainfall 0→1 or large track temp drop
 *   10. Session finished   → chequered flag
 */
export default function useNotificationTriggers() {
  const trackStatus  = useF1Store((s) => s.trackStatus)
  const raceControl  = useF1Store((s) => s.raceControl)
  const timing       = useF1Store((s) => s.timing)
  const weather      = useF1Store((s) => s.weather)
  const session      = useF1Store((s) => s.session)
  const addNotification = useF1Store((s) => s.addNotification)

  // Track previous values to detect transitions
  const prevTrackStatus  = useRef(null)
  const prevRCLength     = useRef(0)
  const prevInPit        = useRef({})   // { [driverNumber]: boolean }
  const prevRetired      = useRef({})   // { [driverNumber]: boolean }
  const prevFastestLap   = useRef(null) // last fastest-lap driver code
  const prevRainfall     = useRef(null)
  const prevPhase        = useRef(null)

  // ── Track status changes ────────────────────────────────────────────────────
  useEffect(() => {
    if (!trackStatus || prevTrackStatus.current === trackStatus.status) return
    const prev = prevTrackStatus.current
    prevTrackStatus.current = trackStatus.status

    if (prev === null) return  // don't fire on first load

    switch (trackStatus.status) {
      case '4':
        addNotification({
          type: 'critical', event: 'safety_car',
          title: 'SAFETY CAR',
          message: `Deployed — Lap ${session.lap ?? '?'}`,
        })
        break
      case '5':
        addNotification({
          type: 'critical', event: 'red_flag',
          title: 'RED FLAG',
          message: `Session stopped — Lap ${session.lap ?? '?'}`,
        })
        break
      case '6':
        addNotification({
          type: 'high', event: 'vsc',
          title: 'VIRTUAL SAFETY CAR',
          message: `VSC deployed — Lap ${session.lap ?? '?'}`,
        })
        break
      case '1':
        // Green — only notify if we came from SC/VSC/Red
        if (['4', '5', '6'].includes(prev)) {
          addNotification({
            type: 'teal', event: 'green_flag',
            title: 'GREEN FLAG',
            message: 'Track is clear — racing resumed',
          })
        }
        break
      default:
        break
    }
  }, [trackStatus, session.lap, addNotification])

  // ── New race control messages ────────────────────────────────────────────────
  useEffect(() => {
    if (raceControl.length <= prevRCLength.current) {
      prevRCLength.current = raceControl.length
      return
    }
    // New messages arrived (raceControl is newest-first)
    const newCount = raceControl.length - prevRCLength.current
    prevRCLength.current = raceControl.length

    raceControl.slice(0, newCount).forEach((msg) => {
      const cat = msg.category?.toLowerCase() ?? ''
      const flg = msg.flag?.toLowerCase() ?? ''
      const txt = msg.message ?? ''

      // DRS
      if (cat === 'drs') {
        const on = txt.toLowerCase().includes('enabled')
        addNotification({
          type: 'blue', event: 'drs',
          title: on ? 'DRS ENABLED' : 'DRS DISABLED',
          message: txt || (on ? 'DRS zones active' : 'DRS zones closed'),
        })
        return
      }

      // Driver penalty
      if (cat === 'flag' && msg.scope === 'Driver' && msg.driver_number) {
        addNotification({
          type: 'high', event: 'penalty',
          title: 'PENALTY',
          message: `#${msg.driver_number} — ${txt}`,
          driverNumber: msg.driver_number,
        })
      }
    })
  }, [raceControl, addNotification])

  // ── Pit stop entry notifications ─────────────────────────────────────────────
  useEffect(() => {
    if (!timing.length) return
    timing.forEach((d) => {
      const prev = prevInPit.current[d.number]
      if (prev === false && d.in_pit === true) {
        addNotification({
          type: 'info', event: 'pit_entry',
          title: 'PIT STOP',
          message: `#${d.number} into the pits — Lap ${session.lap ?? '?'}`,
          driverNumber: d.number,
        })
      }
      prevInPit.current[d.number] = d.in_pit
    })
  }, [timing, session.lap, addNotification])

  // ── Driver retirement ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!timing.length) return
    timing.forEach((d) => {
      const wasRetired = prevRetired.current[d.number]
      if (!wasRetired && d.stopped) {
        addNotification({
          type: 'critical', event: 'retirement',
          title: 'RETIREMENT',
          message: `#${d.number} has retired from the race`,
          driverNumber: d.number,
        })
      }
      prevRetired.current[d.number] = d.stopped
    })
  }, [timing, addNotification])

  // ── Fastest lap ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!timing.length) return
    const fastest = timing.find((d) => d.overall_fastest)
    if (!fastest) return
    const key = `${fastest.number}-${fastest.last_lap}`
    if (key === prevFastestLap.current) return
    prevFastestLap.current = key
    addNotification({
      type: 'medium', event: 'fastest_lap',
      title: 'FASTEST LAP',
      message: `#${fastest.number} — ${fastest.last_lap ?? '?'}`,
      driverNumber: fastest.number,
    })
  }, [timing, addNotification])

  // ── Weather: rainfall starts ──────────────────────────────────────────────────
  useEffect(() => {
    if (weather === null) return
    if (prevRainfall.current === null) {
      prevRainfall.current = weather.rainfall
      return
    }
    if (!prevRainfall.current && weather.rainfall) {
      addNotification({
        type: 'teal', event: 'rain',
        title: 'RAIN DETECTED',
        message: `Track temp ${weather.track_temp ?? '?'}°C — conditions changing`,
      })
    }
    prevRainfall.current = weather.rainfall
  }, [weather, addNotification])

  // ── Session finished (chequered flag) ────────────────────────────────────────
  useEffect(() => {
    if (prevPhase.current === null) {
      prevPhase.current = session.phase
      return
    }
    if (prevPhase.current !== 'FINISHED' && session.phase === 'FINISHED') {
      addNotification({
        type: 'critical', event: 'chequered',
        title: 'CHEQUERED FLAG',
        message: 'Session complete',
      })
    }
    prevPhase.current = session.phase
  }, [session.phase, addNotification])
}
