/**
 * Run: node src/utils/qualifyingUtils.test.mjs   (from pitwall/frontend)
 *
 * Locks the knockout cut maths. A wrong cutIndex tells viewers the wrong
 * drivers are being eliminated, which is exactly the class of silently-wrong
 * output this pass was about.
 */
import assert from 'node:assert/strict'
import {
  getQualifyingCut,
  isQualifyingSessionName,
  qualifyingHeaderLabel,
  DEFAULT_NO_ENTRIES,
} from './qualifyingUtils.js'

let passed = 0
function check(label, got, want) {
  assert.deepEqual(got, want, `${label}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`)
  console.log(`  ok   ${label}`)
  passed++
}

console.log('--- session type detection ---')
check('"Qualifying"', isQualifyingSessionName('Qualifying'), true)
check('"Sprint Shootout"', isQualifyingSessionName('Sprint Shootout'), true)
check('"Sprint Qualifying"', isQualifyingSessionName('Sprint Qualifying'), true)
check('"Race" is not qualifying', isQualifyingSessionName('Race'), false)
check('"Practice 3" is not qualifying', isQualifyingSessionName('Practice 3'), false)
check('null is not qualifying', isQualifyingSessionName(null), false)

console.log('--- 2026 grid: 22 -> 15 -> 10 (verified vs Baku 2026 Q) ---')
const E = [22, 15, 10]
check('Q1 line after P15, P16+ out', getQualifyingCut(1, E),
  { cutIndex: 14, advancing: 15, eliminatedFrom: 16 })
check('Q2 line after P10, P11+ out', getQualifyingCut(2, E),
  { cutIndex: 9, advancing: 10, eliminatedFrom: 11 })
check('Q3 has no cut line', getQualifyingCut(3, E),
  { cutIndex: null, advancing: null, eliminatedFrom: null })

console.log('--- the 20-car era still works (no hardcoding of 2026) ---')
const OLD = [20, 15, 10]
check('Q1 line after P15', getQualifyingCut(1, OLD).cutIndex, 14)
check('Q2 line after P10', getQualifyingCut(2, OLD).cutIndex, 9)

console.log('--- a different format is followed, not overridden ---')
const HYPO = [24, 16, 8]
check('Q1 line after P16', getQualifyingCut(1, HYPO),
  { cutIndex: 15, advancing: 16, eliminatedFrom: 17 })
check('Q2 line after P8', getQualifyingCut(2, HYPO),
  { cutIndex: 7, advancing: 8, eliminatedFrom: 9 })

console.log('--- unknown / malformed input draws no line ---')
check('part null', getQualifyingCut(null, E).cutIndex, null)
check('part 0', getQualifyingCut(0, E).cutIndex, null)
check('part beyond the format', getQualifyingCut(4, E).cutIndex, null)
check('noEntries null falls back to 2026', getQualifyingCut(1, null).advancing, 15)
check('noEntries too short falls back', getQualifyingCut(1, [22]).advancing, 15)
check('noEntries garbage falls back', getQualifyingCut(1, 'nope').advancing, 15)
check('non-integer entry draws no line', getQualifyingCut(1, [22, null, 10]).cutIndex, null)
check('default is the 2026 format', DEFAULT_NO_ENTRIES, [22, 15, 10])

console.log('--- header labels ---')
check('Q1 label', qualifyingHeaderLabel(1, E), 'Q1 · TOP 15 ADVANCE')
check('Q2 label', qualifyingHeaderLabel(2, E), 'Q2 · TOP 10 ADVANCE')
check('Q3 label has no advancement clause', qualifyingHeaderLabel(3, E), 'Q3')
check('no segment yet', qualifyingHeaderLabel(null, E), null)

console.log(`\nall ${passed} assertions passed`)
