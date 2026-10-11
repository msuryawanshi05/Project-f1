/**
 * Run: node src/utils/teamColours.test.mjs   (from pitwall/frontend)
 *
 * Re-derives every value in the table and fails if any drifts below its
 * threshold, so a team colour can never ship unreadable in either mode —
 * which is what the old runtime "darken if luminance > 0.35" heuristic
 * allowed.
 */
import assert from 'node:assert/strict'
import {
  TEAM_LIVERY, TEAM_COLOURS, WORST_SURFACE,
  canonicalTeam, teamColour, rawColour, contrastRatio,
} from './teamColours.js'

let passed = 0
function ok(label) { console.log(`  ok   ${label}`); passed++ }
function check(label, cond, detail) {
  assert.ok(cond, `${label}${detail ? ` — ${detail}` : ''}`)
  ok(`${label}${detail ? ` (${detail})` : ''}`)
}

const AA = 4.5        // normal-size text
const AA_UI = 3.0     // UI components / large text

console.log('--- every team has both modes and both roles ---')
for (const team of Object.keys(TEAM_LIVERY)) {
  for (const mode of ['dark', 'light']) {
    const e = TEAM_COLOURS[mode][team]
    assert.ok(e, `${team} missing in ${mode}`)
    assert.match(e.accent, /^#[0-9A-F]{6}$/i, `${team}.${mode}.accent`)
    assert.match(e.text, /^#[0-9A-F]{6}$/i, `${team}.${mode}.text`)
  }
}
ok(`${Object.keys(TEAM_LIVERY).length} teams × 2 modes × 2 roles present and well-formed`)

console.log('\n--- text variants clear 4.5:1 on the worst-case surface ---')
for (const mode of ['dark', 'light']) {
  const bg = WORST_SURFACE[mode]
  for (const [team, e] of Object.entries(TEAM_COLOURS[mode])) {
    const r = contrastRatio(e.text, bg)
    assert.ok(r >= AA - 0.01, `${team} ${mode} text ${e.text} on ${bg} is ${r.toFixed(2)}:1, needs ${AA}`)
  }
  ok(`${mode}: all ${Object.keys(TEAM_COLOURS[mode]).length} text variants >= ${AA}:1 on ${bg}`)
}

console.log('\n--- accent variants clear 3:1 on the worst-case surface ---')
for (const mode of ['dark', 'light']) {
  const bg = WORST_SURFACE[mode]
  for (const [team, e] of Object.entries(TEAM_COLOURS[mode])) {
    const r = contrastRatio(e.accent, bg)
    assert.ok(r >= AA_UI - 0.01, `${team} ${mode} accent ${e.accent} on ${bg} is ${r.toFixed(2)}:1`)
  }
  ok(`${mode}: all accent variants >= ${AA_UI}:1 on ${bg}`)
}

console.log('\n--- variants stay close to the real livery ---')
// A contrast fix that abandons the livery is a different kind of wrong.
for (const mode of ['dark', 'light']) {
  for (const [team, e] of Object.entries(TEAM_COLOURS[mode])) {
    const toRgb = (h) => [1, 3, 5].map((i) => parseInt(h.replace('#', '').slice(i - 1, i + 1), 16))
    const [lr, lg, lb] = toRgb(TEAM_LIVERY[team])
    const [ar, ag, ab] = toRgb(e.accent)
    const dist = Math.sqrt((lr - ar) ** 2 + (lg - ag) ** 2 + (lb - ab) ** 2)
    assert.ok(dist < 90, `${team} ${mode} accent ${e.accent} is ${dist.toFixed(0)} from livery ${TEAM_LIVERY[team]}`)
  }
  ok(`${mode}: every accent within 90 RGB units of its livery`)
}

console.log('\n--- the previously-unreadable cases ---')
// Mercedes teal on white was the worst offender in light mode.
const mercLightText = TEAM_COLOURS.light['Mercedes'].text
check('Mercedes light text is legible on white',
  contrastRatio(mercLightText, '#FFFFFF') >= AA,
  `${mercLightText} = ${contrastRatio(mercLightText, '#FFFFFF').toFixed(2)}:1`)
check('raw livery would NOT have been legible',
  contrastRatio(TEAM_LIVERY['Mercedes'], '#FFFFFF') < AA,
  `${TEAM_LIVERY['Mercedes']} = ${contrastRatio(TEAM_LIVERY['Mercedes'], '#FFFFFF').toFixed(2)}:1`)
check('Mercedes keeps its exact livery in dark mode',
  TEAM_COLOURS.dark['Mercedes'].text === TEAM_LIVERY['Mercedes'],
  TEAM_LIVERY['Mercedes'])

console.log('\n--- team name resolution ---')
check('exact name', canonicalTeam('Ferrari') === 'Ferrari')
check('RB alias -> Racing Bulls', canonicalTeam('RB') === 'Racing Bulls')
check('RB F1 Team alias', canonicalTeam('RB F1 Team') === 'Racing Bulls')
check('Kick Sauber -> Audi', canonicalTeam('Kick Sauber') === 'Audi')
check('Haas alias', canonicalTeam('Haas') === 'Haas F1 Team')
check('Red Bull alias', canonicalTeam('Red Bull') === 'Red Bull Racing')
check('unknown team', canonicalTeam('Brabham') === null)
check('null', canonicalTeam(null) === null)

console.log('\n--- lookup API ---')
check('explicit dark', teamColour('Ferrari', { role: 'accent', dark: true }) === '#ED1131')
check('explicit light differs where it must',
  teamColour('Mercedes', { role: 'text', dark: false }) !== teamColour('Mercedes', { role: 'text', dark: true }))
check('unknown team falls back, never undefined',
  /^#[0-9A-F]{6}$/i.test(teamColour('Nonexistent', { dark: true })))
check('null team falls back',
  /^#[0-9A-F]{6}$/i.test(teamColour(null, { dark: false })))

console.log('\n--- raw feed colours are made legible, not passed through ---')
check('a too-bright feed colour is darkened in light mode',
  contrastRatio(rawColour('#00FFEE', { role: 'text', dark: false }), '#FFFFFF') >= AA,
  rawColour('#00FFEE', { role: 'text', dark: false }))
check('a too-dark feed colour is lightened in dark mode',
  contrastRatio(rawColour('#101014', { role: 'text', dark: true }), '#141418') >= AA,
  rawColour('#101014', { role: 'text', dark: true }))
check('garbage input falls back', /^#[0-9A-F]{6}$/i.test(rawColour('not-a-colour', { dark: true })))
check('hex without # accepted', /^#[0-9A-F]{6}$/i.test(rawColour('F47600', { dark: true })))

console.log(`\nall ${passed} assertions passed`)
