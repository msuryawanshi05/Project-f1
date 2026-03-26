import { getTrackStatus } from '../../utils/driverUtils'

const BANNER_CONFIG = {
  green:  null,  // no banner when clear
  yellow: { cls: 'status-banner-yellow', icon: '⚠' },
  red:    { cls: 'status-banner-red',    icon: '🔴' },
}

/**
 * TrackStatusBanner — full-width coloured banner when track is not green.
 * Props: statusCode (string "1"-"7")
 */
export default function TrackStatusBanner({ statusCode }) {
  const ts = getTrackStatus(statusCode)
  if (ts.severity === 'green') return null

  const config = BANNER_CONFIG[ts.severity] ?? BANNER_CONFIG.yellow

  return (
    <div className={`${config.cls} w-full py-1.5 px-4 flex items-center justify-center gap-2`}>
      <span className="font-display font-bold text-sm tracking-[0.2em] uppercase">
        {config.icon} {ts.label}
      </span>
    </div>
  )
}
