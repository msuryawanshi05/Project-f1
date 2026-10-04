import { getTrackStatus } from '../../utils/driverUtils'
import useF1Store from '../../store/useF1Store'

const BANNER_CONFIG = {
  green:      null,  // no banner when clear
  yellow:     { cls: 'status-banner-yellow', icon: '🟡', label: 'SAFETY CAR' },
  vsc:        { cls: 'status-banner-yellow', icon: '🟡', label: 'VIRTUAL SAFETY CAR' },
  vsc_ending: { cls: 'status-banner-yellow', icon: '🟡', label: 'VSC ENDING — PREPARE TO RACE' },
  red:        { cls: 'status-banner-red',    icon: '🔴', label: 'RED FLAG — RACE SUSPENDED' },
}

/**
 * TrackStatusBanner — full-width coloured banner when track is not green.
 * Props: statusCode (string "1"–"7")
 *
 * Status codes:
 *  "1" = AllClear / Green
 *  "2" = Yellow flag (local)
 *  "4" = Safety Car (SC)
 *  "5" = Red Flag
 *  "6" = Virtual Safety Car (VSC)
 *  "7" = VSC Ending
 */
export default function TrackStatusBanner({ statusCode }) {
  const ts = getTrackStatus(statusCode)
  const raceControl = useF1Store((s) => s.raceControl)

  // Check if start procedure or race is suspended/delayed even if track status reports green/clear
  const recentProcedureMsg = Array.isArray(raceControl) && raceControl.find((m) => {
    const txt = (m.message ?? '').toUpperCase()
    return (
      txt.includes('START PROCEDURE') ||
      txt.includes('STARTING PROCEDURE') ||
      txt.includes('START ORDER') ||
      txt.includes('FORMATION LAP') ||
      txt.includes('SUSPEND') ||
      txt.includes('DELAY')
    )
  })

  const procTxt = (recentProcedureMsg?.message ?? '').toUpperCase()
  const isSuspended = procTxt.includes('SUSPEND') || procTxt.includes('DELAY') || procTxt.includes('START ORDER')

  if (ts.severity === 'green' && !isSuspended) return null

  // Special keys for different safety car / suspension states
  let configKey = ts.severity
  if (statusCode === '5' || isSuspended) {
    configKey = 'red'
  } else if (statusCode === '6') {
    configKey = 'vsc'
  } else if (statusCode === '7') {
    configKey = 'vsc_ending'
  }

  const config = BANNER_CONFIG[configKey] ?? BANNER_CONFIG.yellow

  // If Red Flag or Suspended, look for a resumption or procedure message
  let bannerLabel = config.label ?? ts.label
  if (isSuspended && recentProcedureMsg?.message) {
    bannerLabel = recentProcedureMsg.message.toUpperCase()
  } else if (statusCode === '5' && Array.isArray(raceControl)) {
    const resumeMsg = raceControl.find((m) => {
      const txt = (m.message ?? '').toUpperCase()
      return txt.includes('RESUME') || txt.includes('RESTART') || txt.includes('SUSPEND') || txt.includes('START ORDER')
    })
    if (resumeMsg?.message) {
      bannerLabel = `RED FLAG — ${resumeMsg.message.toUpperCase()}`
    }
  } else if (statusCode === '4' && Array.isArray(raceControl)) {
    const scInMsg = raceControl.find((m) => {
      const txt = (m.message ?? '').toUpperCase()
      return txt.includes('SAFETY CAR IN THIS LAP') || txt.includes('SC IN THIS LAP')
    })
    const formationMsg = raceControl.find((m) => {
      const txt = (m.message ?? '').toUpperCase()
      return txt.includes('FORMATION LAP')
    })
    if (scInMsg?.message) {
      bannerLabel = 'SAFETY CAR IN THIS LAP — PREPARE FOR RESTART'
    } else if (formationMsg?.message) {
      bannerLabel = formationMsg.message.toUpperCase()
    }
  }


  return (
    <div className={`${config.cls} w-full py-1.5 px-4 flex items-center justify-center gap-2 transition-all duration-300`}>
      <span className="font-display font-bold text-sm tracking-[0.2em] uppercase text-center">
        {config.icon} {bannerLabel}
      </span>
    </div>
  )
}
