import { useEffect, useRef } from 'react'
import useF1Store from '../store/useF1Store'
import { sounds } from '../utils/notificationSounds'
import { resolveDriver } from '../utils/driverUtils'

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
  const dismissNotification = useF1Store((s) => s.dismissNotification)
  const addPitStop = useF1Store((s) => s.addPitStop)
  const tyres = useF1Store((s) => s.tyres)

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
  // Race lifecycle refs (Bug 8)
  const prevPhaseRef       = useRef(session.phase)
  const prevTrackStatusRef = useRef(trackStatus?.status)
  // DRS cooldown: track last message text to avoid duplicates
  const lastDrsMsg      = useRef(null)
  const hasFiredRaceStart = useRef(false)
  const seenRCMsgKeys   = useRef(new Set())
  const isRCInitialized = useRef(false)

  // DEV-only: expose store for browser console debugging
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

  // ── Race Start / Restart lifecycle notifications ─────────────────────────
  useEffect(() => {
    const prevPhase  = prevPhaseRef.current
    const prevStatus = prevTrackStatusRef.current
    const curStatus  = trackStatus?.status
    const curPhase   = session.phase

    // If connected mid-race (lap > 1), don't falsely announce race start
    if ((session.lap && session.lap > 1) || (curPhase === 'LIVE' && prevPhase === null)) {
      hasFiredRaceStart.current = true
    }

    // 1. RACE STARTED — session phase transitions to LIVE for the first time
    if (curPhase === 'LIVE' && !hasFiredRaceStart.current) {
      if (prevPhase !== null && prevPhase !== 'LIVE') {
        addNotification({
          id: Date.now(),
          type: 'critical',
          event: 'race_start',
          title: '🚦 RACE STARTED',
          message: 'Lights out and away we go!',
          live: false,
        })
        sounds.critical()
      }
      hasFiredRaceStart.current = true
    }

    // 2. RACE RESTART IMMINENT — Red Flag (5) → Safety Car (4)
    //    This means: race is about to restart behind the safety car
    if (curStatus === '4' && prevStatus === '5') {
      addNotification({
        id: Date.now(),
        type: 'critical',
        event: 'race_restart',
        title: '🟡 RACE RESTART',
        message: 'Safety Car deployed — race restarting behind SC',
        live: false,
      })
      sounds.critical()
    }

    // 3. RACE RESUMED — Safety Car/VSC (4/6) → Green (1)
    //    Or Red Flag directly cleared → Green
    if (curStatus === '1' && (prevStatus === '4' || prevStatus === '5' || prevStatus === '6')) {
      addNotification({
        id: Date.now(),
        type: 'critical',
        event: 'race_resumed',
        title: '🟢 RACE RESUMED',
        message: 'Green flag — racing is underway',
        live: false,
      })
      sounds.critical()
    }

    // Update refs
    prevPhaseRef.current  = curPhase
    prevTrackStatusRef.current = curStatus
  }, [session.phase, trackStatus?.status, session.lap, addNotification])

  // ── 2. Race control messages (DRS, penalties) ─────────────────────────────
  useEffect(() => {
    if (!isRCInitialized.current) {
      raceControl.forEach((msg) => {
        seenRCMsgKeys.current.add(`${msg.time}_${msg.message}`)
      })
      isRCInitialized.current = true
      return
    }

    raceControl.forEach((msg) => {
      const msgKey = `${msg.time}_${msg.message}`
      if (seenRCMsgKeys.current.has(msgKey)) return
      seenRCMsgKeys.current.add(msgKey)

      const cat = (msg.category ?? '').toLowerCase()
      const txt = msg.message ?? ''
      const upperTxt = txt.toUpperCase()

      // EXCLUDE routine mini-sector yellow / clear flags from popup notifications!
      if (upperTxt.includes('TRACK SECTOR') || upperTxt.includes('SECTOR ') || upperTxt.includes('CLEAR')) {
        return
      }

      // DRS — deduplicate by message text
      if (cat === 'drs' && txt !== lastDrsMsg.current) {
        lastDrsMsg.current = txt
        const on = txt.toLowerCase().includes('enabled')
        addNotification({ type: 'blue', event: 'drs', title: on ? 'DRS ENABLED' : 'DRS DISABLED', message: txt || (on ? 'DRS zones active' : 'DRS zones closed') })
        sounds.blue()
        return
      }

      // Race Resumption / Restart time announcements (e.g. "RACE WILL RESUME AT 15:35")
      if (upperTxt.includes('RESUME') || upperTxt.includes('RESTART')) {
        addNotification({
          id: Date.now() + Math.random(),
          type: 'critical',
          event: 'race_resume_time',
          title: '⏱ RACE RESUMPTION',
          message: txt,
          live: false,
        })
        sounds.critical()
        return
      }

      if (upperTxt.includes('SAFETY CAR IN THIS LAP') || upperTxt.includes('SC IN THIS LAP')) {
        addNotification({
          id: Date.now() + Math.random(),
          type: 'high',
          event: 'sc_ending',
          title: '🟡 SAFETY CAR ENDING',
          message: txt,
          live: false,
        })
        sounds.high()
        return
      }

      // Driver penalty
      if (cat === 'flag' && msg.scope === 'Driver' && msg.driver_number) {
        addNotification({ type: 'high', event: 'penalty', title: 'PENALTY', message: `#${msg.driver_number} — ${txt}`, driverNumber: msg.driver_number })
        sounds.high()
      }
    })
  }, [raceControl, addNotification])

  // ── 3. Pit stops (live timer & auto-dismiss) ──────────────────────────────
  useEffect(() => {
    // GUARD 1: Don't fire pit notifications at lap 0 (race start, pit-lane starters)
    if (!session.lap || session.lap < 1) return

    // GUARD 2: During SC / VSC / Red Flag every driver is in the pits — not a real stop
    // status '4'=SC, '5'=Red Flag, '6'=VSC, '7'=VSC ending
    const isSCOrRedPeriod = ['4', '5', '6', '7'].includes(trackStatus?.status)
    if (isSCOrRedPeriod) {
      // Clear any timers that started before we knew about the SC
      Object.keys(pitTimers.current).forEach((num) => {
        const notifId = pitTimers.current[num]?.notifId
        if (notifId) dismissNotification(notifId)
        delete pitTimers.current[num]
      })
      // Reset prev state so we don't get false re-trigger when SC ends
      timing.forEach((d) => { prevInPit.current[String(d.number)] = d.in_pit })
      return
    }

    // GUARD 3: Only fire if session is genuinely LIVE
    const isLive = session.phase === 'LIVE' || Boolean(session.lap && session.lap >= 1)
    if (!isLive) return

    if (!timing.length) return

    const isRace = String(session.name).toUpperCase().includes('RACE') || String(session.phase).toUpperCase() === 'RACE'

    timing.forEach((d) => {
      const key = String(d.number)
      const wasInPit = prevInPit.current[key]

      // GUARD 4: Never fire pit notifications for retired / stopped drivers!
      const isDriverRetired = retiredDrivers.current.has(key) || d.stopped === true || d.status === 'Retired' || d.status === 'Out' || d.knockout === true
      if (isDriverRetired) {
        if (pitTimers.current[key]) {
          dismissNotification(pitTimers.current[key].notifId)
          delete pitTimers.current[key]
        }
        prevInPit.current[key] = d.in_pit
        return
      }

      // Entered pit lane
      if (d.in_pit && !wasInPit && !pitTimers.current[key]) {
        const notifId = Date.now() + key   // unique per driver
        // Snapshot the compound BEFORE the stop (will be the old_compound on exit)
        const currentTyreState = tyres.find((t) => String(t.number) === String(key))
        pitTimers.current[key] = {
          startMs: Date.now(),
          notifId,
          oldCompound: currentTyreState?.compound ?? 'UNKNOWN',
        }
        
        if (isRace) {
          // Race: Live counter remains on screen until they exit
          addNotification({
            id: notifId,
            type: 'high', event: 'pit_stop',
            title: 'PIT STOP',
            message: `#${key} — in pit lane`,
            driverNumber: key,
            live: true,
          })
        } else {
          // Practice/Quali: Non-live notification that auto-dismisses after 5s
          addNotification({
            id: notifId,
            type: 'high', event: 'pit_stop',
            title: 'PIT STOP',
            message: `#${key} — in pit lane`,
            driverNumber: key,
            live: false,
          })
          setTimeout(() => {
            dismissNotification(notifId)
          }, 5000)
        }
        sounds.high()
      }

      // Exited pit lane (pit_out flag)
      if (d.pit_out && pitTimers.current[key]) {
        const elapsed = ((Date.now() - pitTimers.current[key].startMs) / 1000).toFixed(1)
        
        if (isRace) {
          updateNotification(pitTimers.current[key].notifId, {
            message: `#${key} — ${elapsed}s pit lane`,
            live: false,
          })
          
          // Auto-dismiss completed race stops after 10 seconds to keep stack clean
          const targetId = pitTimers.current[key].notifId
          setTimeout(() => {
            dismissNotification(targetId)
          }, 10000)
        }
        
        // Save completed pit stop into the store
        const currentLap = session.lap ?? 0
        const tyreState = tyres.find((t) => String(t.number) === String(key))
        const stopNum = Math.max(1, (tyreState?.stint_number ?? 2) - 1)
        addPitStop({
          driver_number: String(key),
          stop_number: stopNum,
          lap: currentLap,
          duration: `${elapsed}s`,
          old_compound: pitTimers.current[key].oldCompound,
          new_compound: tyreState?.compound ?? 'UNKNOWN',
        })
        
        delete pitTimers.current[key]
      }

      prevInPit.current[key] = d.in_pit
    })
  }, [timing, trackStatus, addNotification, updateNotification, dismissNotification, session, tyres, addPitStop])

  // ── 4. Driver retirement (fires once per driver per session) ──────────────
  useEffect(() => {
    if (!timing.length) return
    timing.forEach((d) => {
      const isNowRetired = d.stopped === true || d.status === 'Retired' || d.status === 'Out'
      const driverKey = String(d.number)
      if (isNowRetired && !retiredDrivers.current.has(driverKey)) {
        retiredDrivers.current.add(driverKey)
        // Clean up any active pit timer for this driver immediately
        if (pitTimers.current[driverKey]) {
          dismissNotification(pitTimers.current[driverKey].notifId)
          delete pitTimers.current[driverKey]
        }
        const resolved = resolveDriver(driverKey)
        const driverLabel = resolved?.code ? `#${driverKey} (${resolved.code})` : `#${driverKey}`
        addNotification({
          id: Date.now() + Number(driverKey),
          type: 'critical',
          event: 'retirement',
          title: 'RETIREMENT',
          message: `${driverLabel} has retired`,
          driverNumber: driverKey,
        })
        sounds.critical()
      }
    })
  }, [timing, addNotification, dismissNotification])

  // Reset retirement set ONLY when session genuinely changes (e.g. FP1 -> Quali -> Race)
  const prevSessionName = useRef(session.name)
  useEffect(() => {
    if (session.name && prevSessionName.current && prevSessionName.current !== session.name) {
      retiredDrivers.current.clear()
      pitTimers.current = {}
      prevInPit.current = {}
      lastDrsMsg.current = null
      hasFiredRaceStart.current = false
    }
    if (session.name) {
      prevSessionName.current = session.name
    }
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
