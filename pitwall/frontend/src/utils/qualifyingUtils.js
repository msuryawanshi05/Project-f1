/**
 * qualifyingUtils.js — knockout segment maths for the qualifying tower.
 *
 * Getting this wrong draws the elimination line at the wrong position, which
 * tells a viewer the wrong drivers are going out. It is pure and tested
 * (utils/qualifyingUtils.test.mjs) rather than inlined in JSX.
 *
 * Segment detection
 * -----------------
 * The segment number is NOT derivable from the session name. F1 reports
 * SessionInfo.Name as "Qualifying" for all three parts, so the previous
 * `sessionName.includes('Q2')` check was never true and the tower drew the Q1
 * cut line for the whole session. It comes from TimingData.SessionPart, with
 * SessionData.Series[].QualifyingPart as a fallback.
 *
 * Cut positions
 * -------------
 * Driven by TimingData.NoEntries — the car count per segment — rather than the
 * hardcoded 15/10 of the 20-car era. For 2026 the feed sends [22, 15, 10],
 * verified against Baku 2026 Qualifying (22 drivers on track in Q1, 15 in Q2,
 * 10 in Q3), i.e. Q1 eliminates P16–P22 and Q2 eliminates P11–P15.
 */

/** 2026 format. Only used until the feed's own NoEntries arrives. */
export const DEFAULT_NO_ENTRIES = [22, 15, 10]

/** True for a session whose tower should run in qualifying mode. */
export function isQualifyingSessionName(name) {
  return /QUALIFYING|SHOOTOUT/.test(String(name ?? '').toUpperCase())
}

/**
 * Resolve the knockout cut for the current segment.
 *
 * @param {number|null} part       1 | 2 | 3, or null if not yet known
 * @param {number[]|null} noEntries cars per segment, e.g. [22, 15, 10]
 * @returns {{cutIndex: number|null, advancing: number|null, eliminatedFrom: number|null}}
 *   cutIndex       zero-based row index AFTER which the line is drawn, or null
 *                  when no line applies (final segment / unknown segment)
 *   advancing      how many cars carry on into the next segment
 *   eliminatedFrom first eliminated position, 1-based (for the label)
 */
export function getQualifyingCut(part, noEntries) {
  const entries = Array.isArray(noEntries) && noEntries.length >= 2
    ? noEntries
    : DEFAULT_NO_ENTRIES

  // No line in the final segment: everyone still running is in the top 10.
  if (part == null || part < 1 || part >= entries.length) {
    return { cutIndex: null, advancing: null, eliminatedFrom: null }
  }

  const advancing = entries[part]
  if (!Number.isInteger(advancing) || advancing < 1) {
    return { cutIndex: null, advancing: null, eliminatedFrom: null }
  }

  return {
    cutIndex: advancing - 1,
    advancing,
    eliminatedFrom: advancing + 1,
  }
}

/** Short header label for the active segment, e.g. "Q1 · TOP 15 ADVANCE". */
export function qualifyingHeaderLabel(part, noEntries) {
  if (part == null) return null
  const { advancing } = getQualifyingCut(part, noEntries)
  return advancing != null ? `Q${part} · TOP ${advancing} ADVANCE` : `Q${part}`
}
