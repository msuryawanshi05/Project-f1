/**
 * verify-weekend-phases.mjs — drive the clock through a race weekend and look
 * at what the Live page actually renders in each phase.
 *
 *   cd pitwall/frontend && npm run dev
 *   node ../scripts/verify-weekend-phases.mjs
 *
 * Why this exists
 * ───────────────
 * The weekend state machine is a function of the wall clock. Four of its five
 * phases are therefore unreachable by hand on any given day — you cannot see
 * the "qualifying is over, the race has not started" state unless it happens to
 * be Saturday evening of a race weekend. Unit tests cover the state machine
 * (utils/weekendState.test.mjs, utils/startingGrid.test.mjs); this covers the
 * rendering, which they cannot.
 *
 * What it controls
 * ────────────────
 * - The clock, via Playwright's clock API, frozen at a chosen instant.
 * - The calendar and qualifying feeds, served from scripts/fixtures (real
 *   captured Jolpica responses, so the shapes are genuine and the run is
 *   deterministic and offline).
 * - Race control messages, injected into the store, so the grid-penalty path
 *   is exercised with no live feed available.
 *
 * What it asserts
 * ───────────────
 * Per phase: the tower's heading, which sub-tabs are gated, and that a gated
 * tab renders an explanation rather than stale data or a blank panel. Failures
 * print and set a non-zero exit code. Screenshots of every phase in both
 * themes land in scripts/out/weekend-phases/ for a human to look at.
 *
 * One artefact to expect in those screenshots: the sidebar track map draws
 * itself through requestAnimationFrame, and a frozen clock sometimes leaves it
 * part-drawn or blank. It renders correctly against a real clock; it is the
 * verifier's doing, not the page's.
 */

import { createRequire } from 'node:module'
import { mkdirSync, rmSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
// Playwright is a frontend dev dependency; this script lives outside that
// package, so resolve from there rather than from its own directory.
const require_ = createRequire(join(HERE, '../frontend/package.json'))
const { chromium } = require_('playwright')

const OUT = join(HERE, 'out', 'weekend-phases')
const FIXTURES = join(HERE, 'fixtures')
const BASE = process.env.PITWALL_URL ?? 'http://localhost:5173'
const VIEWPORT = { width: 1600, height: 900 }

const calendar = JSON.parse(readFileSync(join(FIXTURES, 'calendar-2026.json'), 'utf-8'))
const qualifying = JSON.parse(readFileSync(join(FIXTURES, 'qualifying-2026-17.json'), 'utf-8'))

const at = (iso) => new Date(iso).getTime()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Grid penalties, as race control words them.
 *
 * Injected rather than fetched: between qualifying and the race the only
 * source of penalties is the live SignalR feed, which does not run outside a
 * session (and is blocked from cloud hosts entirely). Without this the grid
 * would only ever be exercised on its 'provisional' path.
 */
const PENALTIES = [
  { message: 'CAR 16 (LEC) - 10 PLACE GRID PENALTY - EXCEEDING PERMITTED POWER UNIT ELEMENTS', category: 'Other' },
  { message: 'CAR 44 (HAM) - 3 PLACE GRID PENALTY - IMPEDING CAR 12 IN Q1', category: 'Other' },
  { message: 'CAR 12 (ANT) WILL START FROM THE PIT LANE - PARC FERME BREACH', category: 'Other' },
  // Must NOT move anyone on the grid — a time penalty is served in the race.
  { message: 'CAR 55 (SAI) - 5 SECOND TIME PENALTY - LEAVING THE TRACK', category: 'Other' },
]

/**
 * The phases to walk, in weekend order.
 *
 * Round 18 (United States GP, Austin) is a normal weekend; round 17 (Singapore)
 * is a sprint weekend, which has a SECOND grid-limbo window — sprint qualifying
 * to sprint — that the generalised gating rule has to cover without naming it.
 */
const PHASES = [
  {
    id: '01-pre-weekend',
    when: '2026-10-22T14:00:00Z',            // Thu, window open, nothing run
    expectState: 'PRE_WEEKEND',
    expectTowerText: ['nothing has run yet', 'United States'],
    expectGated: ['STRATEGY', 'TELEMETRY', 'RADIO'],
    note: 'Thursday of the US GP weekend — schedule card, no session data anywhere',
  },
  {
    id: '02-fp1-live',
    when: '2026-10-23T18:00:00Z',            // FP1 started 17:30Z
    expectState: 'SESSION_LIVE',
    expectGated: [],
    note: 'FP1 running — nothing gated',
  },
  {
    id: '03-between-practices',
    when: '2026-10-23T19:15:00Z',            // FP1 done, FP2 at 21:00Z
    expectState: 'SESSION_RESULTS',
    expectGated: [],
    note: 'After FP1, well before FP2 — practice results stay readable',
  },
  {
    id: '04-gap-idle',
    when: '2026-10-23T20:45:00Z',            // T-15 to FP2
    expectState: 'GAP_IDLE',
    expectTowerText: ['No session active'],
    expectGated: [],
    note: 'Inside T-30 of FP2 — idle card counting down',
  },
  {
    id: '05-quali-live',
    when: '2026-10-24T21:30:00Z',            // Qualifying started 21:00Z
    expectState: 'SESSION_LIVE',
    expectGated: [],
    note: 'Qualifying running — telemetry and radio are live data',
  },
  {
    id: '06-grid-limbo',
    when: '2026-10-24T23:30:00Z',            // quali over, race Sunday 20:00Z
    expectState: 'SESSION_RESULTS',
    expectTowerText: ['STARTING GRID'],
    expectGated: ['STRATEGY', 'TELEMETRY', 'RADIO'],
    penalties: true,
    note: 'THE phase this work is about: quali done, race tomorrow, tower = grid',
  },
  {
    id: '07-grid-limbo-race-day',
    when: '2026-10-25T19:50:00Z',            // T-10 to the race
    expectState: 'GAP_IDLE',
    expectTowerText: ['STARTING GRID'],
    expectGated: ['STRATEGY', 'TELEMETRY', 'RADIO'],
    penalties: true,
    note: 'Ten minutes to lights out — still the grid, still no session data',
  },
  {
    id: '08-post-weekend',
    when: '2026-10-26T15:00:00Z',            // Monday
    expectState: 'POST_WEEKEND',
    expectGated: [],
    note: 'Monday after the race — weekend window still open, race classified',
  },
  {
    id: '09-sprint-quali-to-sprint',
    when: '2026-10-09T20:00:00Z',            // r17: SQ done 13:15Z, Sprint Sat 09:00Z
    expectState: 'SESSION_RESULTS',
    expectTowerText: ['STARTING GRID'],
    expectGated: ['STRATEGY', 'TELEMETRY', 'RADIO'],
    penalties: true,
    note: 'Sprint weekend: the same rule must gate sprint-quali → sprint',
  },
  {
    id: '10-sprint-done-quali-next',
    when: '2026-10-10T11:00:00Z',            // r17: Sprint done 09:35Z, Quali 13:00Z
    expectState: 'SESSION_RESULTS',
    expectGated: [],
    note: 'Sprint weekend: after the sprint, data is real again until quali',
  },
]

const failures = []
const results = []
function check(phase, label, cond, detail = '') {
  const line = `${cond ? 'ok  ' : 'FAIL'} ${phase.id} · ${label}${detail ? ` — ${detail}` : ''}`
  console.log(`  ${line}`)
  if (!cond) failures.push(line)
}

async function main() {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  const browser = await chromium.launch({ channel: 'chrome' })

  for (const phase of PHASES) {
    console.log(`\n── ${phase.id} @ ${phase.when}\n   ${phase.note}`)

    for (const theme of ['dark', 'light']) {
      const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })

      // Feeds come from fixtures. The page must not reach the network: a live
      // response would make the run depend on the day it is run.
      await ctx.route('**api.jolpi.ca/**', (route) => {
        const url = route.request().url()
        const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
        if (/\/2026\.json/.test(url)) return json(calendar)
        if (/\/qualifying\.json/.test(url)) return json(qualifying)
        if (/driverstandings/.test(url)) {
          return json({ MRData: { StandingsTable: { StandingsLists: [{ DriverStandings: [] }] } } })
        }
        if (/constructorstandings/.test(url)) {
          return json({ MRData: { StandingsTable: { StandingsLists: [{ ConstructorStandings: [] }] } } })
        }
        return json({ MRData: { RaceTable: { Races: [] }, total: '0' } })
      })
      // Everything else third-party: refused rather than silently slow.
      await ctx.route(/(openf1|open-meteo|wikipedia|formula1)\./, (r) => r.abort())

      await ctx.addInitScript(([dark]) => {
        try {
          sessionStorage.setItem('pitwall_booted', '1')
          localStorage.setItem('pitwall_settings', JSON.stringify({ darkMode: dark, soundEnabled: false }))
          // Caches are keyed by wall-clock time; a stale one would survive the
          // clock jump and defeat the point of moving it.
          localStorage.removeItem('pitwall_jolpica_2026')
          for (let i = 1; i <= 24; i++) localStorage.removeItem(`pitwall_quali_2026_r${i}`)
        } catch { /* storage blocked — the page still renders */ }
      }, [theme === 'dark'])

      const page = await ctx.newPage()
      // The socket is never reachable here; failing fast beats a 30s hang.
      await page.routeWebSocket(/.*\/ws$/, (ws) => ws.close())
      await page.clock.install({ time: at(phase.when) })

      await page.goto(`${BASE}/live`, { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => Boolean(globalThis.__pitwall_store), null, { timeout: 20000 })

      if (phase.penalties) {
        await page.evaluate((msgs) => {
          const st = globalThis.__pitwall_store.getState()
          for (const m of msgs) st.addRaceControl({ ...m, time: new Date().toISOString() })
        }, PENALTIES)
      }

      // The clock is frozen, so timers need an explicit nudge for the calendar
      // fetch and the countdown's first tick to settle.
      await page.clock.runFor(1500)
      await wait(600)

      // Read the resolved state out of the hook's own output rather than
      // guessing it from pixels.
      const state = await page.evaluate(() => {
        const el = document.querySelector('[data-weekend-state]')
        return el?.getAttribute('data-weekend-state') ?? null
      })

      if (theme === 'dark') {
        check(phase, 'resolved state', state === phase.expectState, `got ${state}, want ${phase.expectState}`)

        const towerText = await page.locator('[role="tabpanel"], main').first().innerText().catch(() => '')
        for (const want of phase.expectTowerText ?? []) {
          check(phase, `tower mentions "${want}"`, towerText.toLowerCase().includes(want.toLowerCase()))
        }

        // Gated tabs: the nav item must still be clickable, and the panel must
        // say why it is empty.
        const gated = []
        for (const tab of ['STRATEGY', 'TELEMETRY', 'RADIO']) {
          const btn = page.locator(`#${tab.toLowerCase()}-tab`)
          const enabled = await btn.isEnabled()
          check(phase, `${tab} tab stays clickable`, enabled)
          await btn.click()
          await page.clock.runFor(400)
          await wait(250)
          const panel = page.locator('[data-gated-tab]')
          const isGated = (await panel.count()) > 0
          if (isGated) {
            gated.push(tab)
            const body = await panel.first().innerText()
            // Gated is not the same as blank: the panel has to name the reason
            // and say when the data comes back.
            check(phase, `${tab} explains itself`,
              /returns when|appears once|no data for this part/i.test(body),
              body.replace(/\n/g, ' ').slice(0, 90))
            // And it must not be the last session's data with a banner on top.
            check(phase, `${tab} renders no stale timing`,
              !/\bstint\b|\btyre age\b|\bsector \d\b|\blap \d+\b/i.test(body))
          }
          await page.screenshot({ path: join(OUT, `${phase.id}-${tab.toLowerCase()}.png`) })
        }
        const want = (phase.expectGated ?? []).slice().sort().join(',')
        check(phase, 'gated tabs', gated.slice().sort().join(',') === want,
          `got [${gated.join(',')}], want [${phase.expectGated.join(',')}]`)

        await page.locator('#tower-tab').click()
        await page.clock.runFor(400)
        await wait(250)
        results.push({ id: phase.id, state, gated })
      }

      await page.screenshot({ path: join(OUT, `${phase.id}-tower-${theme}.png`), fullPage: false })
      await ctx.close()
    }
  }

  await browser.close()

  console.log('\n──────── summary ────────')
  for (const r of results) console.log(`  ${r.id.padEnd(30)} ${String(r.state).padEnd(18)} gated: ${r.gated.join(',') || '—'}`)
  console.log(`\nscreenshots: ${OUT}`)
  if (failures.length) {
    console.log(`\n${failures.length} FAILED:`)
    for (const f of failures) console.log(`  ${f}`)
    process.exit(1)
  }
  console.log('\nall phase checks passed')
}

main().catch((err) => { console.error(err); process.exit(1) })
