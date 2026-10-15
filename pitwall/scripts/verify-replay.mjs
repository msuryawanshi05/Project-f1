/**
 * verify-replay.mjs — drive the real replay through the real UI and look at it.
 *
 *   cd pitwall/backend && .venv/Scripts/python -m uvicorn main:app --port 8000
 *   cd pitwall/frontend && npm run dev
 *   node ../scripts/verify-replay.mjs
 *
 * The backend tests (backend/test_replay_engine.py) prove the engine emits the
 * right envelopes and reconstructs the right state. They cannot prove the page
 * renders any of it. This drives the browser against the committed 2026 Monza
 * data and asserts on what actually appears:
 *
 *   - the tower fills and the lap counter moves
 *   - a pit stop reaches the strategy log
 *   - the safety car banner says SAFETY CAR, not RED FLAG (the Phase D fix)
 *   - the red flag, separately, says RED FLAG
 *   - telemetry renders for a selected driver, and the distance-axis lap
 *     compare draws a delta trace
 *   - scrubbing to three arbitrary points reconstructs the classification that
 *     the race actually had at those laps
 *   - two browser contexts hold different playheads at the same time
 *   - playing through the weekend walks every Phase E transition
 *
 * Screenshots land in scripts/out/replay/ for a human to look at.
 */

import { createRequire } from 'node:module'
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const require_ = createRequire(join(HERE, '../frontend/package.json'))
const { chromium } = require_('playwright')

const OUT = join(HERE, 'out', 'replay')
const BASE = process.env.PITWALL_URL ?? 'http://localhost:5173'
const API = process.env.PITWALL_API ?? 'http://localhost:8000'
const VIEWPORT = { width: 1600, height: 900 }
const SLUG = '2026-13-italian'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const failures = []
function check(label, cond, detail = '') {
  const line = `${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`
  console.log(`  ${line}`)
  if (!cond) failures.push(line)
}

/** Drive the replay from the page, through the same socket the UI uses. */
async function cmd(page, payload) {
  await page.evaluate((p) => {
    const send = globalThis.__pitwall_store.getState().sendCommand
    if (send) send(p)
  }, payload)
}

async function replayState(page) {
  return page.evaluate(() => globalThis.__pitwall_store.getState().replay)
}

async function storeState(page) {
  return page.evaluate(() => {
    const s = globalThis.__pitwall_store.getState()
    return {
      timing: s.timing.map((d) => ({
        number: d.number, position: d.position, lap: d.lap,
        gap: d.gap_to_leader, pit: d.pit_count, code: d.driver,
      })),
      session: s.session,
      trackStatus: s.trackStatus,
      raceControl: s.raceControl.length,
      tyres: s.tyres.map((t) => ({ number: t.number, compound: t.compound, age: t.age })),
      drivers: s.drivers.length,
    }
  })
}

/** Wait for the store to satisfy a predicate, or give up. */
async function until(page, fn, { timeout = 15000, label = 'condition' } = {}) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (await page.evaluate(fn)) return true
    await wait(250)
  }
  console.log(`    (timed out waiting for ${label})`)
  return false
}

async function newPage(browser, { dark = true } = {}) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
  await ctx.addInitScript((d) => {
    try {
      sessionStorage.setItem('pitwall_booted', '1')
      localStorage.setItem('pitwall_settings', JSON.stringify({ darkMode: d, soundEnabled: false }))
    } catch { /* storage blocked */ }
  }, dark)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/live`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => Boolean(globalThis.__pitwall_store), null, { timeout: 25000 })
  // The transport only works once the socket is up and has published its sender.
  await until(page, () => Boolean(globalThis.__pitwall_store.getState().sendCommand),
    { label: 'websocket' })
  // The weekend state machine cannot resolve without a calendar to resolve
  // against, and Jolpica takes about a second. Asserting before it lands reads
  // every phase as NONE.
  await until(page, () => globalThis.__pitwall_store.getState().calendar.length > 0,
    { label: 'calendar' })
  return { ctx, page }
}

async function load(page, session, at = 0) {
  await cmd(page, { cmd: 'replay.load', weekend: SLUG, session, at })
  await until(page, () => globalThis.__pitwall_store.getState().replay.active,
    { label: `replay ${session}` })
  await wait(400)
}

// ── 1. the race renders ───────────────────────────────────────────────────────

async function raceRenders(browser) {
  console.log('\n── race replay renders in the tower')
  const { ctx, page } = await newPage(browser)

  await load(page, 'race', 3000)
  let st = await storeState(page)
  check('drivers reached the store', st.drivers === 22, `${st.drivers}`)
  check('tower has a full field', st.timing.length >= 18, `${st.timing.length} rows`)
  check('session is named RACE', st.session.name === 'RACE', st.session.name)
  // Monza's lap-4 red flag suspends the race from t=295 to t=2253, so the lap
  // count at t=3000 is lower than the elapsed time suggests.
  check('lap counter has advanced', (st.session.lap ?? 0) >= 8, `lap ${st.session.lap}`)
  check('total laps is 53', st.session.total_laps === 53, `${st.session.total_laps}`)
  check('gaps are populated',
    st.timing.filter((d) => d.gap).length > 10,
    `${st.timing.filter((d) => d.gap).length} with a gap`)
  check('tyre compounds present',
    st.tyres.filter((t) => t.compound && t.compound !== 'UNKNOWN').length > 15)

  await page.screenshot({ path: join(OUT, '01-race-tower.png') })

  // Play, and confirm the tower actually moves.
  const before = st.session.lap
  await cmd(page, { cmd: 'replay.speed', speed: 10 })
  await cmd(page, { cmd: 'replay.play' })
  const advanced = await until(page,
    (b) => (globalThis.__pitwall_store.getState().session.lap ?? 0) > b,
    { timeout: 25000, label: 'lap to advance' })
  // page.evaluate's arg has to be passed through, so re-check explicitly.
  st = await storeState(page)
  check('playing advances the lap counter', (st.session.lap ?? 0) > before,
    `${before} -> ${st.session.lap}`)
  void advanced
  await cmd(page, { cmd: 'replay.pause' })

  await page.screenshot({ path: join(OUT, '02-race-playing.png') })
  await ctx.close()
}

// ── 2. track status: the SC / red-flag distinction ────────────────────────────

async function trackStatusBanner(browser) {
  console.log('\n── safety car and red flag are told apart')
  const { ctx, page } = await newPage(browser)

  // Monza 2026: safety car at t=199, red flag at t=252.
  await load(page, 'race', 210)
  let st = await storeState(page)
  check('track status is safety car', st.trackStatus.status === '4', st.trackStatus.message)
  let banner = await page.locator('[data-track-status]').allInnerTexts()
  const scText = banner.join(' ').toUpperCase()
  check('banner says SAFETY CAR', scText.includes('SAFETY CAR'), scText.slice(0, 70))
  check('banner does NOT say RED FLAG', !scText.includes('RED FLAG'))
  await page.screenshot({ path: join(OUT, '03-safety-car.png') })

  await cmd(page, { cmd: 'replay.seek', at: 300 })
  await wait(1400)
  st = await storeState(page)
  check('track status is red flag', st.trackStatus.status === '5', st.trackStatus.message)
  banner = await page.locator('[data-track-status]').allInnerTexts()
  const redText = banner.join(' ').toUpperCase()
  check('banner says RED FLAG', redText.includes('RED'), redText.slice(0, 70))
  await page.screenshot({ path: join(OUT, '04-red-flag.png') })

  // And the VSC, which is a third thing again.
  await cmd(page, { cmd: 'replay.seek', at: 4500 })
  await wait(1400)
  st = await storeState(page)
  check('track status is VSC', st.trackStatus.status === '6', st.trackStatus.message)
  await ctx.close()
}

// ── 3. strategy log ───────────────────────────────────────────────────────────

async function strategyLog(browser) {
  console.log('\n── pit stops reach the strategy tab')
  const { ctx, page } = await newPage(browser)
  await load(page, 'race', 5400)

  await page.locator('#strategy-tab').click()
  await wait(900)

  const text = (await page.locator('main').innerText()).toUpperCase()
  check('strategy tab is not a standby screen', !text.includes('STANDBY'), text.slice(0, 60))
  check('a tyre compound is named',
    /SOFT|MEDIUM|HARD/.test(text))
  check('a pit stop is logged',
    /PIT|STOP|STINT/.test(text))

  const st = await storeState(page)
  const stops = st.timing.reduce((n, d) => n + (d.pit ?? 0), 0)
  check('the field has pitted', stops > 15, `${stops} stops`)

  await page.screenshot({ path: join(OUT, '05-strategy.png') })
  await ctx.close()
}

// ── 4. telemetry ──────────────────────────────────────────────────────────────

async function telemetry(browser) {
  console.log('\n── telemetry renders, and compares by distance')
  const { ctx, page } = await newPage(browser)
  await load(page, 'qualifying', 3000)

  // The lazy per-driver fetch is the point of splitting the files, so watch
  // for it from before the tab is even opened.
  const requests = []
  page.on('request', (r) => {
    if (r.url().includes('/api/replay/')) requests.push(r.url())
  })

  await page.locator('#telemetry-tab').click()
  await wait(600)
  await page.evaluate(() => {
    globalThis.__pitwall_store.getState().setSelectedTelemetryDriver(10)   // GAS, pole
  })
  await until(page, () => {
    const s = globalThis.__pitwall_store.getState()
    return s.replay.active && document.querySelectorAll('svg.recharts-surface').length >= 3
  }, { timeout: 15000, label: 'telemetry charts' })

  let text = await page.locator('main').innerText()
  check('telemetry is not on standby', !/STANDBY|OFFLINE/i.test(text), text.slice(0, 60))

  const charts = await page.locator('svg.recharts-surface').count()
  check('telemetry charts rendered', charts >= 3, `${charts} charts`)
  await page.screenshot({ path: join(OUT, '06-telemetry.png') })

  // Distance-axis comparison — only possible with recorded laps.
  await page.getByText('COMPARE FEED').click().catch(() => {})
  await wait(400)
  await page.getByText('BY DISTANCE').click()
  await page.evaluate(() => {
    globalThis.__pitwall_store.getState().setCompareTelemetryDriver(63)    // RUS, P2
  })
  await wait(2000)

  text = await page.locator('main').innerText()
  check('lap compare names both drivers', /GAS/.test(text) && /RUS/.test(text))
  check('lap compare shows a delta', /DELTA/i.test(text), text.slice(0, 120).replace(/\n/g, ' '))
  check('lap compare shows the gap between the laps', /[+-]?\d+\.\d{3}s/.test(text))
  const cmpCharts = await page.locator('svg.recharts-surface').count()
  check('delta trace drawn', cmpCharts >= 3, `${cmpCharts} charts`)

  const driverFetches = requests.filter((u) => u.includes('/telemetry/'))
  check('telemetry was fetched per driver',
    driverFetches.length >= 1 && driverFetches.length <= 3,
    `${driverFetches.length} driver fetches: ${driverFetches.map((u) => u.split('/').pop()).join(', ')}`)

  await page.screenshot({ path: join(OUT, '07-lap-compare.png') })
  await ctx.close()
}

// ── 5. scrubbing reconstructs ─────────────────────────────────────────────────

async function scrubbing(browser) {
  console.log('\n── scrubbing reconstructs the real classification')
  const { ctx, page } = await newPage(browser)
  await load(page, 'race', 0)

  // Three arbitrary points, checked against what the race actually was.
  // Numbers are 2026's: ANT 12, RUS 63, VER 3, NOR 1, PIA 81, GAS 10.
  const points = [
    { at: 2600, minLap: 4, note: 'after the restart' },
    { at: 4800, minLap: 25, note: 'mid-race' },
    { at: 7101, minLap: 53, leaders: [12, 63, 3], note: 'the flag' },
  ]

  let previousLap = -1
  for (const p of points) {
    await cmd(page, { cmd: 'replay.seek', at: p.at })
    await wait(900)
    const st = await storeState(page)
    const lap = st.session.lap ?? 0
    const ordered = st.timing.filter((d) => d.position).sort((a, b) => a.position - b.position)

    check(`t=${p.at} (${p.note}) lap >= ${p.minLap}`, lap >= p.minLap, `lap ${lap}`)
    check(`t=${p.at} positions are unique`,
      new Set(ordered.map((d) => d.position)).size === ordered.length)
    check(`t=${p.at} leader has no gap`, !ordered[0]?.gap, ordered[0]?.gap ?? '(none)')
    if (p.leaders) {
      check(`t=${p.at} top three match the result`,
        JSON.stringify(ordered.slice(0, 3).map((d) => d.number)) === JSON.stringify(p.leaders),
        ordered.slice(0, 3).map((d) => `${d.position} ${d.code}`).join(', '))
    }
    previousLap = lap
  }

  // Backwards. Counters that only go up are the real test of a re-fold.
  await cmd(page, { cmd: 'replay.seek', at: 2600 })
  await wait(900)
  const back = await storeState(page)
  check('seeking backwards rewinds the lap counter',
    (back.session.lap ?? 99) < previousLap, `${previousLap} -> ${back.session.lap}`)
  check('seeking backwards rewinds pit counts',
    back.timing.reduce((n, d) => n + (d.pit ?? 0), 0) < 40)

  await page.screenshot({ path: join(OUT, '08-scrubbed.png') })
  await ctx.close()
}

// ── 6. two viewers ────────────────────────────────────────────────────────────

async function twoViewers(browser) {
  console.log('\n── two viewers hold separate playheads')
  const a = await newPage(browser)
  const b = await newPage(browser)

  await load(a.page, 'race', 2600)
  await load(b.page, 'race', 6000)
  await wait(800)

  const sa = await storeState(a.page)
  const sb = await storeState(b.page)
  const ra = await replayState(a.page)
  const rb = await replayState(b.page)

  check('playheads differ', Math.abs(ra.position - rb.position) > 1000,
    `${Math.round(ra.position)} vs ${Math.round(rb.position)}`)
  check('viewers see different laps', (sa.session.lap ?? 0) !== (sb.session.lap ?? 0),
    `${sa.session.lap} vs ${sb.session.lap}`)

  // One scrubs; the other must not move.
  await cmd(a.page, { cmd: 'replay.seek', at: 500 })
  await wait(900)
  const rbAfter = await replayState(b.page)
  check('one viewer scrubbing does not move the other',
    Math.abs(rbAfter.position - rb.position) < 2,
    `${Math.round(rb.position)} -> ${Math.round(rbAfter.position)}`)

  // And different sessions at the same time.
  await load(b.page, 'qualifying', 3000)
  await wait(1400)
  const sbq = await storeState(b.page)
  const saq = await storeState(a.page)
  check('viewers can watch different sessions',
    sbq.session.name === 'QUALIFYING' && saq.session.name === 'RACE',
    `${saq.session.name} / ${sbq.session.name}`)

  await a.page.screenshot({ path: join(OUT, '09-viewer-a.png') })
  await b.page.screenshot({ path: join(OUT, '10-viewer-b.png') })
  await a.ctx.close()
  await b.ctx.close()
}

// ── 7. the Phase E weekend walk ───────────────────────────────────────────────

async function weekendWalk(browser) {
  console.log('\n── playing the weekend walks the Phase E state machine')
  const { ctx, page } = await newPage(browser)

  const phase = () => page.evaluate(() =>
    document.querySelector('[data-weekend-state]')?.getAttribute('data-weekend-state') ?? null)
  const gated = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-gated-tab]')).map((e) => e.getAttribute('data-gated-tab')))

  // Each stop is a real moment of the Monza weekend, reached by the replay's
  // own virtual clock rather than by faking Date.now().
  const stops = [
    { session: 'fp1', at: 1500, want: 'SESSION_LIVE', note: 'FP1 running' },
    { session: 'fp1', at: 9999, want: 'SESSION_RESULTS', note: 'FP1 over, FP2 hours away' },
    { session: 'qualifying', at: 1500, want: 'SESSION_LIVE', note: 'qualifying running' },
    { session: 'qualifying', at: 9999, want: 'SESSION_RESULTS', note: 'quali over — the grid phase' },
    { session: 'race', at: 1500, want: 'SESSION_LIVE', note: 'race running' },
    { session: 'race', at: 9999, want: 'POST_WEEKEND', note: 'chequered flag' },
  ]

  const seen = []
  for (const stop of stops) {
    await load(page, stop.session, stop.at)
    await wait(900)
    const got = await phase()
    const r = await replayState(page)
    seen.push(got)
    check(`${stop.session}@${stop.at} (${stop.note})`, got === stop.want,
      `got ${got}, want ${stop.want} · virtual ${r.virtualNow?.slice(0, 16)}`)

    if (stop.want === 'SESSION_RESULTS' && stop.session === 'qualifying') {
      const content = await page.evaluate(() =>
        document.querySelector('[data-tower-content]')?.getAttribute('data-tower-content'))
      check('  tower shows the starting grid', content === 'STARTING_GRID', content)
      // Only the open tab mounts its panel, so click through them.
      const names = []
      for (const tab of ['strategy', 'telemetry', 'radio']) {
        await page.locator(`#${tab}-tab`).click()
        await wait(400)
        const panel = await page.locator('[data-gated-tab]').count()
        if (panel > 0) names.push(tab)
      }
      void gated
      check('  all three are gated in the grid phase', names.length === 3, names.join(','))
      await page.locator('#tower-tab').click()
      await page.screenshot({ path: join(OUT, '11-grid-phase.png') })
    }
  }

  check('the walk reached at least three distinct phases',
    new Set(seen).size >= 3, [...new Set(seen)].join(' -> '))

  await page.screenshot({ path: join(OUT, '12-post-weekend.png') })
  await ctx.close()
}

// ── 8. first-load transfer size ───────────────────────────────────────────────

async function transferSize(browser) {
  console.log('\n── what a viewer actually downloads')
  const { ctx, page } = await newPage(browser)

  const bytes = { replay: 0, total: 0 }
  page.on('response', async (res) => {
    const len = Number(res.headers()['content-length'] ?? 0)
    bytes.total += len
    if (res.url().includes('/api/replay/')) bytes.replay += len
  })

  await load(page, 'race', 0)
  await cmd(page, { cmd: 'replay.speed', speed: 10 })
  await cmd(page, { cmd: 'replay.play' })
  await wait(4000)
  await cmd(page, { cmd: 'replay.pause' })

  // The event stream never crosses HTTP at all: it is pushed down the socket
  // the page already had open, which is why watching the tower costs nothing
  // beyond the page itself.
  console.log(`    replay HTTP transfer while watching the race tower: ${(bytes.replay / 1024).toFixed(1)} KB`)
  check('watching the tower downloads under 5 MB of replay data',
    bytes.replay < 5 * 1024 * 1024, `${(bytes.replay / 1024).toFixed(1)} KB`)
  await ctx.close()
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  const probe = await fetch(`${API}/api/replay`).then((r) => r.json()).catch(() => null)
  if (!probe?.available) {
    console.error(`No replay data served by ${API}. Build it with scripts/build-replay.py.`)
    process.exit(1)
  }
  console.log(`Replaying: ${probe.weekends[0].name} (${probe.weekends[0].event_date})`)

  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    await raceRenders(browser)
    await trackStatusBanner(browser)
    await strategyLog(browser)
    await telemetry(browser)
    await scrubbing(browser)
    await twoViewers(browser)
    await weekendWalk(browser)
    await transferSize(browser)
  } finally {
    await browser.close()
  }

  console.log(`\nscreenshots: ${OUT}`)
  if (failures.length) {
    console.log(`\n${failures.length} FAILED:`)
    for (const f of failures) console.log(`  ${f}`)
    process.exit(1)
  }
  console.log('\nall replay checks passed')
}

main().catch((err) => { console.error(err); process.exit(1) })
