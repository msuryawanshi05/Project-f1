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
  if (ts.severity === 'green') return null

  // Special keys for different safety car / suspension states
  let configKey = ts.severity
  if (statusCode === '5') {
    configKey = 'red'
  } else if (statusCode === '6') {
    configKey = 'vsc'
  } else if (statusCode === '7') {
    configKey = 'vsc_ending'
  }

  const config = BANNER_CONFIG[configKey] ?? BANNER_CONFIG.yellow

  // If Red Flag, look for a resumption message (e.g. "RACE WILL RESUME AT 15:35")
  let bannerLabel = config.label ?? ts.label
  if (statusCode === '5' && Array.isArray(raceControl)) {
    const resumeMsg = raceControl.find((m) => {
      const txt = (m.message ?? '').toUpperCase()
      return txt.includes('RESUME') || txt.includes('RESTART')
    })
    if (resumeMsg?.message) {
      bannerLabel = `RED FLAG — ${resumeMsg.message}`
    }
  } else if (statusCode === '4' && Array.isArray(raceControl)) {
    const scInMsg = raceControl.find((m) => {
      const txt = (m.message ?? '').toUpperCase()
      return txt.includes('SAFETY CAR IN THIS LAP') || txt.includes('SC IN THIS LAP')
    })
    if (scInMsg?.message) {
      bannerLabel = 'SAFETY CAR IN THIS LAP — PREPARE FOR RESTART'
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
