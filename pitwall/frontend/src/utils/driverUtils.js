import teamsData from '../data/teams.json'
import drivers2026 from '../data/drivers2026.json'
import { teamColour, rawColour, canonicalTeam } from './teamColours'

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
/**
 * Colour for a driver.
 *
 * @param {number|string} driverNumber
 * @param {Array} drivers         live driver list (for team identification)
 * @param {'accent'|'text'} role  'accent' for bars/dots/strokes (needs 3:1),
 *                                'text' for driver codes and labels (4.5:1)
 *
 * Team-first, deliberately: the canonical per-mode variant from
 * utils/teamColours beats the raw feed hex, because the feed sends the livery
 * with no regard for the background it will be drawn on. A feed colour is only
 * used for a team that is not on the table, and even then it is nudged until
 * it is legible rather than rendered as given.
 */
export function getTeamColour(driverNumber, drivers, role = 'accent') {
  const driver = getDriver(driverNumber, drivers)
  const teamName = driver?.team ?? teamsData.driverTeams[String(driverNumber)] ?? null

  if (teamName && canonicalTeam(teamName)) {
    return teamColour(teamName, { role })
  }
  if (driver?.team_colour) return rawColour(driver.team_colour, { role })
  return teamColour(teamName, { role })
}

/** Colour for a team by name — standings, constructor views, charts. */
export function getTeamColourByName(teamName, role = 'accent') {
  return teamColour(teamName, { role })
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
export function formatGap(gap, position) {
  if (position === 1 || position === '1' || gap === 'LEADER') return 'LEADER'
  if (gap == null || gap === '') return '---'
  if (typeof gap === 'number') return `+${gap.toFixed(3)}`
  const s = String(gap).trim()
  if (s.toUpperCase().startsWith('LAP') && (position === 1 || position === '1')) return 'LEADER'
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
 * Map an F1 mini-sector segment status code to a colour name.
 *
 * Verified empirically against 9,669 real mini-sector values from Baku 2026
 * Qualifying (OpenF1 /v1/laps, session_key 11391):
 *   2048 -> 5118 occurrences (most common => slower than own best)
 *   2049 -> 3926             (personal best)
 *   2051 ->  321             (rare; 12 on the session's fastest lap => purple)
 *   2064 ->  190             (seen on an 822 s in-pit lap => pit lane)
 *
 * 2048 and 2051 were previously swapped here and in signalr_client.py, which
 * drew every purple mini-sector yellow and vice versa. Keep this in sync with
 * _SEGMENT_COLOUR in backend/signalr_client.py.
 */
export function getSegmentColour(code) {
  const map = {
    2048: 'yellow',  // slower than this driver's own best
    2049: 'green',   // personal best
    2051: 'purple',  // fastest overall in the session
    2064: 'pit',     // pit lane / not timed
  }
  return map[code] ?? 'white'
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

export const countryAbbreviations = {
  'Australia': 'AU',
  'China': 'CN',
  'Japan': 'JP',
  'Bahrain': 'BH',
  'Saudi Arabia': 'SA',
  'USA': 'US',
  'United States': 'US',
  'Miami': 'US',
  'United Arab Emirates': 'AE',
  'UAE': 'AE',
  'Brazil': 'BR',
  'Mexico': 'MX',
  'Italy': 'IT',
  'Spain': 'ES',
  'Monaco': 'MC',
  'Canada': 'CA',
  'Austria': 'AT',
  'UK': 'GB',
  'United Kingdom': 'GB',
  'Belgium': 'BE',
  'Netherlands': 'NL',
  'Hungary': 'HU',
  'Azerbaijan': 'AZ',
  'Singapore': 'SG',
  'Qatar': 'QA',
}

export function getCountryAbbreviation(country) {
  if (!country) return '🏁'
  const clean = country.trim()
  return countryAbbreviations[clean] ?? clean.slice(0, 2).toUpperCase()
}

/**
 * Format countdown from total remaining seconds to a standardized string
 * e.g., "6D 06H 18M 33S" or "06H 18M 33S"
 */
export function formatCountdown(totalSeconds) {
  if (totalSeconds == null || isNaN(totalSeconds) || totalSeconds <= 0) {
    return '00H 00M 00S'
  }
  const d = Math.floor(totalSeconds / 86400)
  const h = Math.floor((totalSeconds % 86400) / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)

  const dStr = d > 0 ? `${d}D ` : ''
  const hStr = `${String(h).padStart(2, '0')}H `
  const mStr = `${String(m).padStart(2, '0')}M`
  const sStr = ` ${String(s).padStart(2, '0')}S`

  return `${dStr}${hStr}${mStr}${sStr}`
}

/**
 * Format session datetime according to standardized time zone rules:
 * - Current weekend = IST only (e.g. "17:00 IST")
 * - Future/past races = GMT + IST together (e.g. "11:30 GMT / 17:00 IST")
 * - Optionally prefixes with day details, e.g. "Fri, 12 Jun · 17:00 IST"
 */
export function formatSessionTime(dateOrDateStr, timeStr, isCurrent, includeDate = false) {
  if (!dateOrDateStr) return '—'
  try {
    let dt
    if (dateOrDateStr instanceof Date) {
      dt = dateOrDateStr
    } else {
      const timeClean = timeStr ? (timeStr.includes('Z') || timeStr.includes('+') || timeStr.includes('-') ? timeStr : `${timeStr}Z`) : '12:00:00Z'
      dt = new Date(`${dateOrDateStr.trim()}T${timeClean.trim()}`)
    }
    if (isNaN(dt.getTime())) return '—'

    // GMT:
    const gmtHrs = String(dt.getUTCHours()).padStart(2, '0')
    const gmtMins = String(dt.getUTCMinutes()).padStart(2, '0')
    const gmtStr = `${gmtHrs}:${gmtMins} GMT`

    // IST (UTC + 5:30):
    const istTime = new Date(dt.getTime() + 330 * 60000)
    const istHrs = String(istTime.getUTCHours()).padStart(2, '0')
    const istMins = String(istTime.getUTCMinutes()).padStart(2, '0')
    const istStr = `${istHrs}:${istMins} IST`

    const timeParts = isCurrent ? istStr : `${gmtStr} / ${istStr}`

    if (includeDate) {
      const dayStr = dt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
      return `${dayStr} · ${timeParts}`
    }
    return timeParts
  } catch {
    return '—'
  }
}

/**
 * Calculates the relative luminance of a hex color.
 */
export function getLuminance(hex) {
  if (!hex || typeof hex !== 'string') return 0
  const cleanHex = hex.replace('#', '')
  if (cleanHex.length !== 6) return 0
  
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255
  
  const a = [r, g, b].map((v) => {
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722
}

/**
 * Darkens a hex color by a given factor (0 to 1).
 */
export function darkenColour(hex, factor = 0.7) {
  if (!hex || typeof hex !== 'string') return '#000000'
  const cleanHex = hex.replace('#', '')
  if (cleanHex.length !== 6) return hex
  
  let r = parseInt(cleanHex.substring(0, 2), 16)
  let g = parseInt(cleanHex.substring(2, 4), 16)
  let b = parseInt(cleanHex.substring(4, 6), 16)
  
  r = Math.max(0, Math.min(255, Math.floor(r * factor)))
  g = Math.max(0, Math.min(255, Math.floor(g * factor)))
  b = Math.max(0, Math.min(255, Math.floor(b * factor)))
  
  const rs = r.toString(16).padStart(2, '0')
  const gs = g.toString(16).padStart(2, '0')
  const bs = b.toString(16).padStart(2, '0')
  return `#${rs}${gs}${bs}`
}

/**
 * Checks if the theme is currently in light mode and, if so, darkens bright/pale colors
 * to ensure dynamic contrast readability.
 */
/**
 * Make an arbitrary hex legible in the current mode.
 *
 * Previously this darkened anything with luminance > 0.35 when it detected
 * light mode. That is a rule of thumb, not a contrast guarantee: it fired on
 * colours that did not need it, missed ones that did, and gave different
 * answers for the same colour depending on the caller. It now delegates to the
 * contrast-checked path in utils/teamColours.
 *
 * Prefer getTeamColour / getTeamColourByName where the team is known — those
 * return the canonical per-mode variant instead of correcting a raw hex.
 */
export function getSafeTeamColour(hex, role = 'accent') {
  return rawColour(hex, { role })
}

/**
 * Resolve a driver's 3-letter code from:
 * 1. Live drivers[] array from SignalR DriverList (most accurate)
 * 2. Static 2026 driver map (immediate fallback before DriverList arrives)
 * 3. teams.json driverCodes map
 * 4. Raw car number as last resort
 */
export function resolveDriverCode(driverNumber, liveDrivers = []) {
  if (!driverNumber) return '???'
  const numStr = String(driverNumber)
  // 1. Live store
  const live = liveDrivers.find((d) => String(d.number) === numStr || String(d.driver_number) === numStr)
  if (live?.code && isNaN(Number(live.code))) return live.code
  // 2. Static 2026 map
  const static2026 = drivers2026[numStr]
  if (static2026?.code) return static2026.code
  // 3. teams.json driverCodes
  const staticCode = teamsData.driverCodes[numStr]
  if (staticCode) return staticCode
  // 4. Fallback
  return `#${numStr}`
}

/**
 * Resolve complete driver information (code, name, nationality, team)
 * with robust fallbacks from static datasets when live SignalR driverList
 * lacks metadata.
 */
export function resolveDriver(driverNumber, liveDrivers = []) {
  if (!driverNumber) return null
  const numStr = String(driverNumber)
  const live = liveDrivers.find((d) => String(d.number) === numStr || String(d.driver_number) === numStr)
  const static2026 = drivers2026[numStr]
  const staticTeam = teamsData.driverTeams[numStr]
  
  const code = (live?.code && isNaN(Number(live.code))) 
    ? live.code 
    : (static2026?.code ?? teamsData.driverCodes[numStr] ?? `#${numStr}`)
  const name = (live?.full_name && live.full_name.trim() !== '')
    ? live.full_name
    : (live?.name || static2026?.name || `Driver ${numStr}`)
  const nationality = live?.nationality || static2026?.nationality || ''
  const team = live?.team || static2026?.team || staticTeam || 'Unknown'

  return {
    code,
    name,
    nationality,
    team,
  }
}

/**
 * Determine a race's state relative to current time.
 * Returns: { status: 'DONE' | 'ONGOING' | 'UPCOMING', isDone, isOngoing, isUpcoming, isLive, raceStart, raceEnd }
 */
export function getRaceStatus(race, now = new Date()) {
  if (!race?.date) {
    return { status: 'UPCOMING', isDone: false, isOngoing: false, isUpcoming: true, isLive: false }
  }

  const raceTime = race.time ?? '14:00:00Z'
  const timeStr = raceTime.endsWith('Z') || raceTime.includes('+') ? raceTime : `${raceTime}Z`
  const raceStart = new Date(`${race.date}T${timeStr}`)
  // Allow up to 6 hours after scheduled start or until end of the UTC race day
  const raceEnd = new Date(Math.max(
    raceStart.getTime() + 6 * 60 * 60 * 1000,
    new Date(`${race.date}T23:59:59Z`).getTime()
  ))

  // Race weekend window starts at FP1 or 3 days before race
  let weekendStart
  if (race.FirstPractice?.date) {
    const fpTime = race.FirstPractice.time ?? '10:00:00Z'
    const fpStr = fpTime.endsWith('Z') || fpTime.includes('+') ? fpTime : `${fpTime}Z`
    weekendStart = new Date(`${race.FirstPractice.date}T${fpStr}`)
  } else {
    weekendStart = new Date(raceStart.getTime() - 3 * 86400000)
  }

  const nowMs = now.getTime()
  const todayStr = now.toISOString().slice(0, 10)

  // On the actual race day, the race weekend is active and ONGOING
  if (race.date === todayStr) {
    const isLive = nowMs >= raceStart.getTime()
    return { status: 'ONGOING', isDone: false, isOngoing: true, isUpcoming: nowMs < raceStart.getTime(), isLive, raceStart, raceEnd }
  }

  if (nowMs > raceEnd.getTime()) {
    return { status: 'DONE', isDone: true, isOngoing: false, isUpcoming: false, isLive: false, raceStart, raceEnd }
  }

  if (nowMs >= weekendStart.getTime() && nowMs <= raceEnd.getTime()) {
    const isLive = nowMs >= raceStart.getTime() && nowMs <= raceEnd.getTime()
    return { status: 'ONGOING', isDone: false, isOngoing: true, isUpcoming: false, isLive, raceStart, raceEnd }
  }

  return { status: 'UPCOMING', isDone: false, isOngoing: false, isUpcoming: true, isLive: false, raceStart, raceEnd }
}

