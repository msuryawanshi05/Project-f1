/**
 * Run: node src/utils/trackStatusBanner.test.mjs   (from pitwall/frontend)
 *
 * Found while recording the demo GIF: deploying the safety car rendered
 * "RED FLAG — RACE SUSPENDED" across the top of the Live page. The banner was
 * keyed on getTrackStatus().severity, which maps BOTH code 4 (safety car) and
 * code 5 (red flag) to 'red' — correct for badge colouring, wrong as an
 * identity. Severity says how alarming something is; only the code says what
 * is happening.
 *
 * Telling a viewer the race is stopped when it is running behind the safety car
 * is a material error, so the mapping is pinned here.
 */
import assert from 'node:assert/strict'
import { bannerKeyForStatus } from './trackStatus.js'

let passed = 0
function check(label, got, want) {
  assert.equal(got, want, `${label}: got ${got}, want ${want}`)
  console.log(`  ok   ${label} -> ${got}`)
  passed++
}

console.log('--- the regression ---')
check('4 (safety car) is NOT the red-flag banner', bannerKeyForStatus('4'), 'safety_car')
check('5 (red flag) is', bannerKeyForStatus('5'), 'red')
assert.notEqual(bannerKeyForStatus('4'), bannerKeyForStatus('5'),
  'safety car and red flag must not render the same banner')
console.log('  ok   safety car and red flag are distinct')
passed++

console.log('--- the rest of the codes ---')
check('2 yellow', bannerKeyForStatus('2'), 'yellow_flag')
check('3 yellow', bannerKeyForStatus('3'), 'yellow_flag')
check('6 VSC', bannerKeyForStatus('6'), 'vsc')
check('7 VSC ending', bannerKeyForStatus('7'), 'vsc_ending')

console.log('--- pre-race suspension overrides ---')
check('suspended start is red regardless of code',
  bannerKeyForStatus('1', { preRaceSuspended: true }), 'red')
check('suspended start beats a safety car code',
  bannerKeyForStatus('4', { preRaceSuspended: true }), 'red')

console.log('--- unknown input degrades to the least alarming banner ---')
check('unknown code', bannerKeyForStatus('99'), 'yellow_flag')
check('undefined', bannerKeyForStatus(undefined), 'yellow_flag')
check('null', bannerKeyForStatus(null), 'yellow_flag')

console.log(`\nall ${passed} assertions passed`)
