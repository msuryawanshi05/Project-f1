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
  const isLiveReady     = useRef(false)
  // Race lifecycle refs (Bug 8)
  const prevPhaseRef       = useRef(session.phase)
  const prevTrackStatusRef = useRef(trackStatus?.status)
  // DRS cooldown: track last message text to avoid duplicates
  const lastDrsMsg      = useRef(null)
  const hasFiredRaceStart = useRef(false)
  const seenRCMsgKeys   = useRef(new Set())

  // On initial mount: clear any stale past notifications from previous sessions
  useEffect(() => {
    useF1Store.getState().resetNotificationHistory()
    // Grace period for WebSocket to stream and hydrate all initial historical snapshots
    const timer = setTimeout(() => {
      isLiveReady.current = true
    }, 2500)
    return () => clearTimeout(timer)
  }, [])

  // DEV-only: expose store for browser console debugging
  useEffect(() => {
    if (import.meta.env.DEV) {
      globalThis.__pitwall_store = useF1Store.getState()
    }
  }, [])

  // ── 1. Track status (live transitions only) ────────────────────────────────
  useEffect(() => {
    const status = trackStatus?.status
    if (!status || status === lastTrackStatus.current) return
    const prev = lastTrackStatus.current
    lastTrackStatus.current = status

    // Do not fire on cold start or during initial store hydration
    if (prev === null || !isLiveReady.current) return

    const curLap = session.lap ?? '?'
    if (status === '4') {
      if (addNotification({
        type: 'critical',
        event: 'safety_car',
        title: 'SAFETY CAR',
        message: `Deployed — Lap ${curLap}`,
        dedupKey: `sc_${curLap}`
      })) {
        sounds.critical()
      }
    } else if (status === '5') {
      if (addNotification({
        type: 'critical',
        event: 'red_flag',
        title: 'RED FLAG',
        message: `Session stopped — Lap ${curLap}`,
        dedupKey: `red_${curLap}`
      })) {
        sounds.critical()
      }
    } else if (status === '6') {
      if (addNotification({
        type: 'high',
        event: 'vsc',
        title: 'VIRTUAL SAFETY CAR',
        message: `Deployed — Lap ${curLap}`,
        dedupKey: `vsc_${curLap}`
      })) {
        sounds.high()
      }
    } else if (status === '1' && ['4', '5', '6'].includes(prev)) {
      if (addNotification({
        type: 'teal',
        event: 'green_flag',
        title: 'GREEN FLAG',
        message: 'Track clear — racing resumed',
        dedupKey: `green_${curLap}`
      })) {
        sounds.teal()
      }
      lastTrackStatus.current = '1'
    }
  }, [trackStatus, session.lap, addNotification])

  // ── Race Start / Restart lifecycle notifications ─────────────────────────
  useEffect(() => {
    const prevPhase  = prevPhaseRef.current
    const prevStatus = prevTrackStatusRef.current
    const curStatus  = trackStatus?.status
    const curPhase   = session.phase
    const curLap     = session.lap

    // If connected mid-race (lap >= 1 or any completed lap in timing), mark race start as already happened
    const hasLaps = (curLap && curLap >= 1) || timing.some((d) => d.number_of_laps > 0)
    if (hasLaps || (curPhase === 'LIVE' && prevPhase === null) || !isLiveReady.current) {
      hasFiredRaceStart.current = true
    }

    // 1. RACE STARTED — only if session genuinely starts live in front of the user
    if (isLiveReady.current && curPhase === 'LIVE' && !hasFiredRaceStart.current && !hasLaps) {
      if (prevPhase !== null && prevPhase !== 'LIVE') {
        if (addNotification({
          id: Date.now(),
          type: 'critical',
          event: 'race_start',
          title: '🚦 RACE STARTED',
          message: 'Lights out and away we go!',
          live: false,
          dedupKey: 'race_start'
        })) {
          sounds.critical()
        }
      }
      hasFiredRaceStart.current = true
    }

    // 2. RACE RESTART IMMINENT — Red Flag (5) → Safety Car (4)
    if (isLiveReady.current && curStatus === '4' && prevStatus === '5') {
      if (addNotification({
        id: Date.now(),
        type: 'critical',
        event: 'race_restart',
        title: '🟡 RACE RESTART',
        message: 'Safety Car deployed — race restarting behind SC',
        live: false,
        dedupKey: `restart_sc_${curLap ?? ''}`
      })) {
        sounds.critical()
      }
    }

    // 3. RACE RESUMED — Safety Car/VSC (4/6) → Green (1)
    if (isLiveReady.current && curStatus === '1' && (prevStatus === '4' || prevStatus === '5' || prevStatus === '6')) {
      if (addNotification({
        id: Date.now(),
        type: 'critical',
        event: 'race_resumed',
        title: '🟢 RACE RESUMED',
        message: 'Green flag — racing is underway',
        live: false,
        dedupKey: `resumed_green_${curLap ?? ''}`
      })) {
        sounds.critical()
      }
    }

    // Update refs
    prevPhaseRef.current  = curPhase
    prevTrackStatusRef.current = curStatus
  }, [session.phase, trackStatus?.status, session.lap, timing, addNotification])

  // ── 2. Race control messages (DRS, penalties, restarts) ───────────────────
  useEffect(() => {
    // During hydration: silently mark all existing historical messages as seen
    if (!isLiveReady.current) {
      raceControl.forEach((msg) => {
        seenRCMsgKeys.current.add(`${msg.time}_${msg.message}`)
      })
      return
    }

    raceControl.forEach((msg) => {
      const msgKey = `${msg.time}_${msg.message}`
      if (seenRCMsgKeys.current.has(msgKey)) return
      seenRCMsgKeys.current.add(msgKey)

      const cat = (msg.category ?? '').toLowerCase()
      const txt = msg.message ?? ''
      const upperTxt = txt.toUpperCase()

      // 1. EXCLUDE routine mini-sector yellow / clear flags, blue flags, deleted lap times
      if (
        msg.flag === 'BLUE' ||
        upperTxt.includes('BLUE FLAG') ||
        upperTxt.includes('TRACK SECTOR') ||
        upperTxt.includes('SECTOR ') ||
        upperTxt.includes('CLEAR') ||
        upperTxt.includes('DELETED')
      ) {
        return
      }

      // 2. Real driver penalties (e.g. "5 SECOND TIME PENALTY", "DRIVE THROUGH", "STOP AND GO")
      const isPenalty = upperTxt.includes('PENALTY') || 
                        upperTxt.includes('DRIVE THROUGH') || 
                        upperTxt.includes('STOP AND GO') || 
                        upperTxt.includes('STOP/GO') || 
                        upperTxt.includes('DISQUALIFIED') ||
                        upperTxt.includes('BLACK AND WHITE FLAG')
      if (isPenalty) {
        const drvNum = msg.driver_number || (upperTxt.match(/CAR\s+(\d+)/i) ? upperTxt.match(/CAR\s+(\d+)/i)[1] : null)
        const title = upperTxt.includes('TIME PENALTY') ? 'TIME PENALTY' : 'PENALTY'
        if (addNotification({
          type: 'high',
          event: 'penalty',
          title,
          message: txt,
          driverNumber: drvNum,
          dedupKey: `penalty_${msgKey}`
        })) {
          sounds.high()
        }
        return
      }

      // 3. DRS — deduplicate by message text
      if (cat === 'drs' && txt !== lastDrsMsg.current) {
        lastDrsMsg.current = txt
        const on = txt.toLowerCase().includes('enabled')
        if (addNotification({
          type: 'blue',
          event: 'drs',
          title: on ? 'DRS ENABLED' : 'DRS DISABLED',
          message: txt || (on ? 'DRS zones active' : 'DRS zones closed'),
          dedupKey: `drs_${txt}`
        })) {
          sounds.blue()
        }
        return
      }

      // 4. Race Resumption / Restart time announcements (e.g. "RACE WILL RESUME AT 15:35")
      if (upperTxt.includes('RESUME') || upperTxt.includes('RESTART')) {
        if (addNotification({
          id: Date.now() + Math.random(),
          type: 'critical',
          event: 'race_resume_time',
          title: '⏱ RACE RESUMPTION',
          message: txt,
          live: false,
          dedupKey: `resume_${msgKey}`
        })) {
          sounds.critical()
        }
        return
      }

      // 5. Safety Car ending
      if (upperTxt.includes('SAFETY CAR IN THIS LAP') || upperTxt.includes('SC IN THIS LAP')) {
        if (addNotification({
          id: Date.now() + Math.random(),
          type: 'high',
          event: 'sc_ending',
          title: '🟡 SAFETY CAR ENDING',
          message: txt,
          live: false,
          dedupKey: `sc_ending_${msgKey}`
        })) {
          sounds.high()
        }
        return
      }
    })
  }, [raceControl, addNotification])

  // ── 3. Pit stops (live timer & auto-dismiss) ──────────────────────────────
  useEffect(() => {
    // GUARD 1: Don't fire pit notifications at lap 0 (race start, pit-lane starters)
    if (!session.lap || session.lap < 1) return

    // GUARD 2: During SC / VSC / Red Flag every driver is in the pits — not a real stop
    const isSCOrRedPeriod = ['4', '5', '6', '7'].includes(trackStatus?.status)
    if (isSCOrRedPeriod) {
      Object.keys(pitTimers.current).forEach((num) => {
        const notifId = pitTimers.current[num]?.notifId
        if (notifId) dismissNotification(notifId)
        delete pitTimers.current[num]
      })
      timing.forEach((d) => { prevInPit.current[String(d.number)] = d.in_pit })
      return
    }

    // GUARD 3: Only fire if session is genuinely LIVE
    const isLive = session.phase === 'LIVE' || Boolean(session.lap && session.lap >= 1)
    if (!isLive) return

    if (!timing.length) return

    // During hydration: silently capture existing pit states
    if (!isLiveReady.current) {
      timing.forEach((d) => {
        prevInPit.current[String(d.number)] = d.in_pit
      })
      return
    }

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

      // Entered pit lane (strict transition from false -> true)
      if (d.in_pit && wasInPit === false && !pitTimers.current[key]) {
        const notifId = Date.now() + key   // unique per driver
        const currentTyreState = tyres.find((t) => String(t.number) === String(key))
        pitTimers.current[key] = {
          startMs: Date.now(),
          notifId,
          oldCompound: currentTyreState?.compound ?? 'UNKNOWN',
        }
        
        const added = addNotification({
          id: notifId,
          type: 'high',
          event: 'pit_stop',
          title: 'PIT STOP',
          message: `#${key} — in pit lane`,
          driverNumber: key,
          lap: session.lap ?? 0,
          live: isRace,
          dedupKey: `pit_${key}_lap_${session.lap ?? 0}`
        })
        if (!isRace) {
          setTimeout(() => {
            dismissNotification(notifId)
          }, 5000)
        }
        if (added) sounds.high()
      }

      // Exited pit lane (pit_out flag)
      if (d.pit_out && pitTimers.current[key]) {
        const elapsed = ((Date.now() - pitTimers.current[key].startMs) / 1000).toFixed(1)
        
        if (isRace) {
          updateNotification(pitTimers.current[key].notifId, {
            message: `#${key} — ${elapsed}s pit lane`,
            live: false,
          })
          
          const targetId = pitTimers.current[key].notifId
          setTimeout(() => {
            dismissNotification(targetId)
          }, 10000)
        }
        
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

    // During hydration: silently record existing retirements so past crashes don't fire popups
    if (!isLiveReady.current) {
      timing.forEach((d) => {
        const isNowRetired = d.stopped === true || d.status === 'Retired' || d.status === 'Out'
        if (isNowRetired) {
          retiredDrivers.current.add(String(d.number))
        }
      })
      return
    }

    timing.forEach((d) => {
      const isNowRetired = d.stopped === true || d.status === 'Retired' || d.status === 'Out'
      const driverKey = String(d.number)
      if (isNowRetired && !retiredDrivers.current.has(driverKey)) {
        retiredDrivers.current.add(driverKey)
        if (pitTimers.current[driverKey]) {
          dismissNotification(pitTimers.current[driverKey].notifId)
          delete pitTimers.current[driverKey]
        }
        const resolved = resolveDriver(driverKey)
        const driverLabel = resolved?.code ? `#${driverKey} (${resolved.code})` : `#${driverKey}`
        if (addNotification({
          id: Date.now() + Number(driverKey),
          type: 'critical',
          event: 'retirement',
          title: 'RETIREMENT',
          message: `${driverLabel} has retired`,
          driverNumber: driverKey,
          dedupKey: `retirement_${driverKey}`
        })) {
          sounds.critical()
        }
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
    if (!isLiveReady.current) {
      prevFastestKey.current = key
      return
    }
    if (key === prevFastestKey.current) return
    prevFastestKey.current = key
    if (addNotification({
      type: 'medium',
      event: 'fastest_lap',
      title: 'FASTEST LAP',
      message: `#${fastest.number} — ${fastest.last_lap ?? '?'}`,
      driverNumber: fastest.number,
      dedupKey: `fastest_${key}`
    })) {
      sounds.medium()
    }
  }, [timing, addNotification])

  // ── 6. Rain ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (weather === null) return
    if (!isLiveReady.current || prevRainfall.current === null) {
      prevRainfall.current = weather.rainfall
      return
    }
    if (!prevRainfall.current && weather.rainfall) {
      if (addNotification({
        type: 'teal',
        event: 'rain',
        title: 'RAIN DETECTED',
        message: `Track temp ${weather.track_temp ?? '?'}°C`,
        dedupKey: 'rain'
      })) {
        sounds.teal()
      }
    }
    prevRainfall.current = weather.rainfall
  }, [weather, addNotification])

  // ── 7. Chequered flag ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLiveReady.current || prevPhase.current === null) {
      prevPhase.current = session.phase
      return
    }
    if (prevPhase.current !== 'FINISHED' && session.phase === 'FINISHED') {
      if (addNotification({
        type: 'critical',
        event: 'chequered',
        title: 'CHEQUERED FLAG',
        message: 'Session complete',
        dedupKey: 'chequered'
      })) {
        sounds.chequered()
      }
    }
    prevPhase.current = session.phase
  }, [session.phase, addNotification])
}
