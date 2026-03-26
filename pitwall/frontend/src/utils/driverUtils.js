import teamsData from '../data/teams.json'

/**
 * Get full driver object from store's drivers array by car number.
 */
export function getDriver(driverNumber, drivers) {
  return drivers.find((d) => d.number === driverNumber) ?? null
}

/**
 * Get team colour hex string.
 * Tries live drivers array first, falls back to static teams.json map.
 */
export function getTeamColour(driverNumber, drivers) {
  const driver = getDriver(driverNumber, drivers)
  if (driver?.team_colour) {
    const hex = driver.team_colour
    return hex.startsWith('#') ? hex : `#${hex}`
  }
  const teamName = teamsData.driverTeams[String(driverNumber)]
  return teamsData.teamColours[teamName] ?? '#FFFFFF'
}

/**
 * Get team name for a driver number.
 * Tries live drivers array first, falls back to static map.
 */
export function getTeamName(driverNumber, drivers) {
  const driver = getDriver(driverNumber, drivers)
  if (driver?.team) return driver.team
  return teamsData.driverTeams[String(driverNumber)] ?? 'Unknown'
}

/**
 * Format lap time from seconds (float) to "1:29.412".
 * Returns "--:--.---" if null, undefined, or NaN.
 */
export function formatLapTime(seconds) {
  if (seconds == null || isNaN(seconds)) return '--:--.---'
  const mins = Math.floor(seconds / 60)
  const secs = (seconds % 60).toFixed(3).padStart(6, '0')
  return `${mins}:${secs}`
}

/**
 * Format sector time from seconds to "28.412".
 * Returns "--.---" if null or NaN.
 */
export function formatSector(seconds) {
  if (seconds == null || isNaN(seconds)) return '--.---'
  return Number(seconds).toFixed(3)
}

/**
 * Format gap string.
 * Handles "LEADER", "+2.341", numeric, or null.
 */
export function formatGap(gap) {
  if (gap == null || gap === '') return '---'
  if (gap === 'LEADER') return 'LEADER'
  if (typeof gap === 'number') return `+${gap.toFixed(3)}`
  return gap
}

/**
 * Map track status code to human label and severity.
 */
export function getTrackStatus(statusCode) {
  const map = {
    '1': { label: 'ALL CLEAR',    severity: 'green'  },
    '2': { label: 'YELLOW FLAG',  severity: 'yellow' },
    '3': { label: 'FLAG',         severity: 'yellow' },
    '4': { label: 'SAFETY CAR',   severity: 'red'    },
    '5': { label: 'RED FLAG',     severity: 'red'    },
    '6': { label: 'VSC DEPLOYED', severity: 'yellow' },
    '7': { label: 'VSC ENDING',   severity: 'yellow' },
  }
  return map[statusCode] ?? { label: 'UNKNOWN', severity: 'green' }
}

/**
 * Map segment colour code integer to CSS class name string.
 */
export function getSegmentColour(code) {
  const map = {
    2048: 'purple',  // fastest overall
    2049: 'green',   // personal best
    2051: 'yellow',  // slower than personal best
    2064: 'white',   // pit lane / SC period
  }
  return map[code] ?? 'white'
}

/**
 * Determine qualifying session phase and eliminated drivers.
 * Returns { phase: "Q1"|"Q2"|"Q3", eliminated: [driverNumbers] }
 */
export function getQualiPhase(sessionName, timing) {
  const phase = sessionName?.includes('Q3')
    ? 'Q3'
    : sessionName?.includes('Q2')
    ? 'Q2'
    : 'Q1'

  const eliminated = timing.filter((d) => d.knockout).map((d) => d.number)

  return { phase, eliminated }
}

/**
 * Parse gap string (e.g. "+2.341", "LEADER", "+1 LAP") to seconds.
 * Returns 0 for leader, null for LAP gaps (not plottable on a seconds chart).
 */
export function parseGapToSeconds(gap) {
  if (!gap || gap === 'LEADER') return 0
  const s = String(gap).replace('+', '').trim()
  if (s.includes('LAP')) return null
  const num = parseFloat(s)
  return isNaN(num) ? null : num
}

/**
 * Format pit stop duration seconds as "22.847s".
 */
export function formatPitDuration(seconds) {
  if (seconds == null) return '---.---s'
  return `${Number(seconds).toFixed(3)}s`
}

/**
 * Convert wind direction degrees to 8-point compass label.
 */
export function degreesToCompass(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round((deg ?? 0) / 45) % 8]
}
