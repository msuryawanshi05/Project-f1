import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useF1Store from '../../store/useF1Store'
import { getSafeTeamColour } from '../../utils/driverUtils'

const TEAM_COLOURS = {
  'Red Bull': '#3671C6', 'Ferrari': '#E8002D', 'Mercedes': '#27F4D2',
  'McLaren': '#FF8000', 'Aston Martin': '#229971', 'Alpine': '#FF87BC',
  'Williams': '#64C4FF', 'RB': '#6692FF', 'Haas': '#B6BABD', 'Sauber': '#52E252',
  'Audi': '#A6A6A6', 'Cadillac': '#EEB211',
}

function getTeamColourByName(name) {
  const hex = Object.entries(TEAM_COLOURS).find(([k]) =>
    name?.toLowerCase().includes(k.toLowerCase())
  )?.[1] ?? '#555555'
  return getSafeTeamColour(hex)
}

export default function BroadcastBanner() {
  const timing = useF1Store((s) => s.timing)
  const drivers = useF1Store((s) => s.drivers)
  const trackStatus = useF1Store((s) => s.trackStatus)
  const raceControl = useF1Store((s) => s.raceControl)

  const [activeEvent, setActiveEvent] = useState(null)

  // Tracking refs to detect changes
  const prevP1 = useRef(null)
  const prevFastest = useRef(null)
  const prevRetired = useRef(new Set())
  const lastTrackStatus = useRef(null)
  const prevRCLength = useRef(0)

  // Queue of events to display
  const eventQueue = useRef([])
  const isDisplaying = useRef(false)

  // Helper to get driver details
  const getDriverDetails = (driverNum) => {
    const d = drivers.find((drv) => String(drv.number) === String(driverNum))
    return {
      code: d?.short_name ?? d?.code ?? `#${driverNum}`,
      name: d?.familyName ?? '',
      team: d?.team_name ?? d?.constructor_name ?? '',
      teamColour: getTeamColourByName(d?.team_name ?? d?.constructor_name ?? '')
    }
  }

  // Trigger banner display
  const triggerBanner = (event) => {
    // Avoid building massive queues
    if (eventQueue.current.length >= 2) {
      eventQueue.current.shift()
    }
    eventQueue.current.push(event)
    processQueue()
  }

  const processQueue = () => {
    if (isDisplaying.current || eventQueue.current.length === 0) return
    isDisplaying.current = true
    const nextEvent = eventQueue.current.shift()
    setActiveEvent(nextEvent)

    // Auto dismiss after 5 seconds
    setTimeout(() => {
      setActiveEvent(null)
      // Wait for exit animation to complete before processing next
      setTimeout(() => {
        isDisplaying.current = false
        processQueue()
      }, 500)
    }, 5000)
  }

  // 1. Detect Lead Change, Fastest Lap, and Retirements
  useEffect(() => {
    if (!timing || timing.length === 0 || drivers.length === 0) return

    // 1.1 Detect Lead Change
    const currentP1Row = timing.find((t) => String(t.position) === '1')
    if (currentP1Row) {
      const currentP1Num = currentP1Row.driver_number ?? currentP1Row.number
      if (prevP1.current && prevP1.current !== currentP1Num) {
        const details = getDriverDetails(currentP1Num)
        triggerBanner({
          type: 'lead_change',
          title: 'LEAD CHANGE',
          message: `${details.code} TAKES THE LEAD!`,
          accent: '#FFF200', // Yellow
          driverDetails: details
        })
      }
      prevP1.current = currentP1Num
    }

    // 1.2 Detect Fastest Lap
    const currentFastestRow = timing.find((t) => t.overall_fastest)
    if (currentFastestRow) {
      const currentFastestNum = currentFastestRow.driver_number ?? currentFastestRow.number
      const lapTime = currentFastestRow.last_lap_time_in_s ?? currentFastestRow.last_lap
      const currentFastestKey = `${currentFastestNum}-${lapTime}`
      
      if (prevFastest.current && prevFastest.current !== currentFastestKey) {
        const details = getDriverDetails(currentFastestNum)
        triggerBanner({
          type: 'fastest_lap',
          title: 'FASTEST LAP',
          message: `${details.code} · ${typeof lapTime === 'number' ? lapTime.toFixed(3) : lapTime}`,
          accent: '#B468FF', // Purple
          driverDetails: details
        })
      }
      prevFastest.current = currentFastestKey
    }

    // 1.3 Detect Retirements
    timing.forEach((t) => {
      const num = String(t.driver_number ?? t.number)
      const isStopped = t.stopped || t.status?.toUpperCase() === 'OUT' || t.status?.toUpperCase() === 'DNF' || t.status?.toUpperCase() === 'RETIRED'
      if (isStopped && !prevRetired.current.has(num)) {
        prevRetired.current.add(num)
        const details = getDriverDetails(num)
        triggerBanner({
          type: 'retirement',
          title: 'RETIREMENT',
          message: `${details.code} HAS RETIRED`,
          accent: '#E8002D', // Red
          driverDetails: details
        })
      }
    })

  }, [timing, drivers])

  // 2. Track Status Changes (Safety Car, Red/Yellow flags)
  useEffect(() => {
    if (!trackStatus || !trackStatus.status) return
    if (lastTrackStatus.current === trackStatus.status) return
    
    const prev = lastTrackStatus.current
    lastTrackStatus.current = trackStatus.status
    
    if (prev === null) return // skip cold start
    
    let title = 'TRACK STATUS'
    let accent = '#FFFFFF'
    let msg = trackStatus.message || 'Status Change'
    
    if (trackStatus.status === '4') {
      title = 'SAFETY CAR'
      accent = '#FFF200' // Yellow
      msg = 'SAFETY CAR DEPLOYED'
    } else if (trackStatus.status === '5') {
      title = 'RED FLAG'
      accent = '#E8002D' // Red
      msg = 'RED FLAG — SESSION SUSPENDED'
    } else if (trackStatus.status === '6') {
      title = 'VIRTUAL SAFETY CAR'
      accent = '#FFF200'
      msg = 'VSC DEPLOYED'
    } else if (trackStatus.status === '1') {
      title = 'GREEN FLAG'
      accent = '#00A651' // Green
      msg = 'TRACK CLEAR — RACING RESUMED'
    }
    
    triggerBanner({
      type: 'track_status',
      title,
      message: msg,
      accent,
      driverDetails: { teamColour: accent, team: 'Race Control' }
    })
  }, [trackStatus])

  // 3. Race Control Alerts (Crashes, Incidents, Investigations, Penalties)
  useEffect(() => {
    if (!raceControl || raceControl.length === 0) return
    
    // Cold start — don't replay past race control messages from earlier laps!
    if (prevRCLength.current === 0) {
      prevRCLength.current = raceControl.length
      return
    }

    if (raceControl.length <= prevRCLength.current) {
      prevRCLength.current = raceControl.length
      return
    }
    
    const newCount = raceControl.length - prevRCLength.current
    const newMsgs = raceControl.slice(0, newCount)
    prevRCLength.current = raceControl.length
    
    newMsgs.forEach((msg) => {
      const txt = msg.message ?? ''
      const cat = (msg.category ?? '').toUpperCase()
      const upperTxt = txt.toUpperCase()
      
      // EXCLUDE mini-sector yellow / clear flags!
      // (e.g. "YELLOW IN TRACK SECTOR 8", "CLEAR IN TRACK SECTOR 16")
      if (upperTxt.includes('TRACK SECTOR') || upperTxt.includes('SECTOR ') || upperTxt.includes('CLEAR')) {
        return // Routine marshal flags belong in Race Control list, NOT broadcast banner
      }
      
      const isIncident = upperTxt.includes('COLLISION') || 
                         upperTxt.includes('CRASH') || 
                         upperTxt.includes('STOPPED') || 
                         upperTxt.includes('ACCIDENT') ||
                         upperTxt.includes('INVESTIGAT') || 
                         upperTxt.includes('PENALTY')
                         
      if (isIncident || cat === 'INVESTIGATION' || cat === 'PENALTY') {
        let accent = '#FFF200'
        let title = cat || 'RACE CONTROL'
        
        if (upperTxt.includes('PENALTY')) {
          accent = '#E8002D'
          title = 'PENALTY'
        } else if (upperTxt.includes('INVESTIGAT')) {
          accent = '#FF8000'
          title = 'UNDER INVESTIGATION'
        } else if (upperTxt.includes('CRASH') || upperTxt.includes('STOPPED') || upperTxt.includes('ACCIDENT')) {
          accent = '#E8002D'
          title = 'INCIDENT'
        }
        
        let driverDetails = { teamColour: accent, team: 'Race Control' }
        if (msg.driver_number) {
          try {
            const details = getDriverDetails(msg.driver_number)
            if (details) driverDetails = details
          } catch (_) {}
        }
        
        triggerBanner({
          type: 'race_control_alert',
          title,
          message: txt,
          accent,
          driverDetails
        })
      }
    })
  }, [raceControl, drivers])

  return (
    <AnimatePresence>
      {activeEvent && (
        <motion.div
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none flex justify-center"
        >
          {/* F1 slanted cockpit layout */}
          <div className="flex h-14 bg-black/95 text-white font-display border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.8)] overflow-hidden relative skew-x-[-12deg]"
            style={{ minWidth: 400, borderRadius: 2 }}
          >
            {/* Team color accent bar */}
            <div 
              className="w-2.5 h-full flex-shrink-0"
              style={{ backgroundColor: activeEvent.driverDetails.teamColour }}
            />

            {/* Event Category Flag Tag */}
            <div 
              className="px-4 flex items-center justify-center font-black tracking-widest text-xs italic select-none"
              style={{ 
                backgroundColor: activeEvent.accent,
                color: activeEvent.type === 'fastest_lap' ? '#FFF' : '#000'
              }}
            >
              <span className="skew-x-[12deg]">{activeEvent.title}</span>
            </div>

            {/* Main content body */}
            <div className="flex-1 flex items-center px-6 pr-8 select-none">
              <div className="skew-x-[12deg] flex items-center gap-3">
                <span className="font-extrabold text-[15px] tracking-wider text-white">
                  {activeEvent.message}
                </span>
                <span className="font-semibold text-[10px] tracking-widest text-pitwall-dim uppercase">
                  {activeEvent.driverDetails.team}
                </span>
              </div>
            </div>

            {/* Ambient indicator dot */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 skew-x-[12deg]">
              <span className="w-1.5 h-1.5 rounded-full led-dot dim" 
                style={{ backgroundColor: activeEvent.accent, color: activeEvent.accent }} 
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
