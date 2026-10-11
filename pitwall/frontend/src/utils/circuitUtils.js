import circuits from '../data/circuits.json'

/**
 * Resolve a Jolpica race object to its circuits.json entry.
 *
 * circuitId FIRST, deliberately. Matching on `round` is what caused every
 * weekend from R4 onward to load the wrong circuit: circuits.json used to
 * encode a stale 24-round calendar, so round N pointed at a different track
 * than Jolpica's round N. circuitId is stable across calendar revisions;
 * round is not. Round is never used as a fallback — showing the wrong
 * circuit is worse than showing none.
 *
 * Single source of truth: useRaceWeekendState, Season and Home all call this,
 * so the Live page and the Season page can no longer disagree about which
 * track a round is held at.
 */
export function matchCircuit(race) {
  if (!race) return null

  const cid = race.Circuit?.circuitId
  if (cid) {
    const byId = circuits.find((c) => c.circuitId === cid)
    if (byId) return byId
  }

  const cName = (race.Circuit?.circuitName ?? '').toLowerCase().trim()
  if (cName) {
    const byCircuit = circuits.find((c) => {
      const cn = (c.circuit ?? '').toLowerCase().trim()
      return cn && (cn === cName || cn.includes(cName) || cName.includes(cn))
    })
    if (byCircuit) return byCircuit
  }

  const rn = (race.raceName ?? '').toLowerCase().replace(' grand prix', '').trim()
  if (!rn) return null
  return circuits.find((c) => {
    const cn = (c.name ?? '').toLowerCase().replace(' grand prix', '').trim()
    return cn && (cn === rn || cn.includes(rn) || rn.includes(cn))
  }) ?? null
}

export default matchCircuit
