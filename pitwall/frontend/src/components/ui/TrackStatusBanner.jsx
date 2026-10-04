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
  const session = useF1Store((s) => s.session)
  const timing = useF1Store((s) => s.timing)

  const currentLap = session?.lap ?? timing?.[0]?.lap ?? (timing?.length > 0 ? 1 : null)
  const isRaceStarted = Boolean(currentLap && currentLap >= 1)

  // Check if start procedure is suspended/delayed BEFORE the race starts
  const latestMsg = Array.isArray(raceControl) && raceControl.length > 0 ? raceControl[0] : null
  const latestTxt = (latestMsg?.message ?? '').toUpperCase()

  const isPreRaceSuspended = !isRaceStarted && (
    latestTxt.includes('START PROCEDURE SUSPENDED') ||
    latestTxt.includes('STARTING PROCEDURE SUSPENDED') ||
    latestTxt.includes('DELAYED START') ||
    latestTxt.includes('START DELAYED')
  )

  // If track is green/clear and not suspended pre-race, show nothing
  if (ts.severity === 'green' && !isPreRaceSuspended) return null

  // Special keys for different safety car / suspension states
  let configKey = ts.severity
  if (statusCode === '5' || isPreRaceSuspended) {
    configKey = 'red'
  } else if (statusCode === '6') {
    configKey = 'vsc'
  } else if (statusCode === '7') {
    configKey = 'vsc_ending'
  }

  const config = BANNER_CONFIG[configKey] ?? BANNER_CONFIG.yellow

  let bannerLabel = config.label ?? ts.label
  if (isPreRaceSuspended && latestMsg?.message) {
    bannerLabel = latestMsg.message.toUpperCase()
  } else if (statusCode === '5' && Array.isArray(raceControl)) {
    const resumeMsg = raceControl.slice(0, 5).find((m) => {
      const txt = (m.message ?? '').toUpperCase()
      return txt.includes('RESUME') || txt.includes('RESTART')
    })
    if (resumeMsg?.message) {
      bannerLabel = `RED FLAG — ${resumeMsg.message.toUpperCase()}`
    }
  } else if (statusCode === '4' && Array.isArray(raceControl)) {
    const scInMsg = raceControl.slice(0, 5).find((m) => {
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
