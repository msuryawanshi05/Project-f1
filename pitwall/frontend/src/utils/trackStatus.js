/**
 * trackStatus.js — what a track status code means, as opposed to how alarming
 * it is.
 *
 * These are two different questions and conflating them produced a real bug:
 * TrackStatusBanner keyed its banner off getTrackStatus().severity, which maps
 * BOTH code 4 (safety car) and code 5 (red flag) to 'red' — correct for badge
 * colouring, since both are serious — so deploying the safety car rendered
 * "RED FLAG — RACE SUSPENDED" across the Live page while the race was running
 * behind the SC.
 *
 * Severity answers "how alarming". Only the code answers "what is happening".
 */

/**
 * Banner identity for a track status code.
 *
 * @param {string} statusCode  "1".."7" from the TrackStatus feed
 * @param {{preRaceSuspended?: boolean}} opts
 * @returns {'yellow_flag'|'safety_car'|'vsc'|'vsc_ending'|'red'}
 */
export function bannerKeyForStatus(statusCode, { preRaceSuspended = false } = {}) {
  if (preRaceSuspended) return 'red'
  return ({
    '2': 'yellow_flag',
    '3': 'yellow_flag',
    '4': 'safety_car',
    '5': 'red',
    '6': 'vsc',
    '7': 'vsc_ending',
  })[statusCode] ?? 'yellow_flag'
}

export default bannerKeyForStatus
