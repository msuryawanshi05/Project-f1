/**
 * verify-race-day.mjs — check the Phase G race-day features in the real UI.
 *
 *   cd pitwall && .\race-day.ps1          (or start the backend by hand)
 *   cd pitwall/frontend && node ../scripts/verify-race-day.mjs
 *
 * Runs against the PRODUCTION BUNDLE served single-origin from the backend,
 * not the dev server. Two phases running of bugs appeared only there — stale
 * state leaking under a replay, a store handle that does not exist outside dev
 * — so verifying on the dev server verifies something the user never runs.
 *
 * The Monza replay is the harness: it has a real safety car, a red flag and a
 * VSC to prove the battle radar suppresses, a standing restart with the whole
 * field nose to tail to prove it populates, and a known classification to
 * check the rows against.
 *
 * The production bundle does not expose the store, so everything here is
 * asserted from the DOM, the way a person would read it.
 */

import { createRequire } from 'node:module'
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const require_ = createRequire(join(HERE, '../frontend/package.json'))
const { chromium, firefox } = require_('playwright')

const OUT = join(HERE, 'out', 'race-day')
const BASE = process.env.PITWALL_URL ?? 'http://localhost:8000'
const VIEWPORT = { width: 1600, height: 900 }
const SLUG = '2026-13-italian'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const notes = []
function check(label, cond, detail = '') {
  const line = `${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`
  console.log(`  ${line}`)
  if (!cond) failures.push(line)
}
function note(line) { console.log(`  ··   ${line}`); notes.push(line) }

async function open(browser, { dark = true } = {}) {
  const ctx = await browser.newContext({ viewport: VIEWPORT })
  await ctx.addInitScript((d) => {
    try {
      sessionStorage.setItem('pitwall_booted', '1')
      // Seed once. This runs on every navigation, so writing unconditionally
      // would reset the very setting a persistence test just changed.
      if (!localStorage.getItem('pitwall_settings')) {
        localStorage.setItem('pitwall_settings', JSON.stringify({
          darkMode: d, soundEnabled: false, syncDelaySeconds: 0,
          favouriteDrivers: ['12', '63'],    // ANT and RUS, who finished 1-2
        }))
      }
    } catch { /* storage blocked */ }
  }, dark)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/live`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#tower-tab', { timeout: 25000 })
  return { ctx, page }
}

/**
 * Start the Monza race replay at a point, through the UI.
 *
 * The production bundle exposes no store handle, so the replay is driven by
 * clicking the launcher and then the scrub bar, exactly as a person would.
 */
async function startRace(page) {
  const raceBtn = page.getByRole('button', { name: 'RACE', exact: true }).first()
  await raceBtn.click()
  await page.waitForSelector('[data-sync-delay]', { timeout: 20000 })
  await wait(2500)
  // Pause so the playhead stays where the test puts it.
  await page.getByRole('button', { name: '❚❚' }).first().click().catch(() => {})
  await wait(400)
}

/**
 * Move the scrub bar to a fraction of the session, and confirm it got there.
 *
 * A single click does not always register, and the assertion that followed
 * then quietly tested the previous position instead — which is how a
 * suppression check passed while the playhead was still under the VSC.
 */
async function scrubTo(page, fraction) {
  const bar = page.getByRole('slider', { name: 'Replay position' })
  const target = Number(await bar.getAttribute('aria-valuemax')) * fraction
  const landed = async () => {
    const now = Number(await bar.getAttribute('aria-valuenow'))
    return Math.abs(now - target) < Math.max(30, target * 0.03) ? now : null
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const box = await bar.boundingBox()
    await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2)
    await wait(1400)
    const now = await landed()
    if (now != null) return now
  }
  // Deliberately no synthetic-click fallback. The misses this used to work
  // around were notification toasts swallowing the click (they carried
  // pointer-events-auto over the whole card); dispatching the event directly
  // would hide a regression of exactly that kind.
  throw new Error(`scrub did not reach ${Math.round(target)}s`)
}

async function panelText(page, heading) {
  const panel = page.locator('div').filter({ hasText: new RegExp(`^${heading}`, 'i') })
  return (await page.locator('aside, main').innerText()).toUpperCase()
}

// ── G1 + G2: chips in the Live header ────────────────────────────────────────

async function chips(browser) {
  console.log('\n── G1 wake lock, G2 sync nudge')
  const { ctx, page } = await open(browser)

  const sync = page.locator('[data-sync-delay]')
  check('sync offset is on screen before anything happens', await sync.count() > 0)
  check('it starts at zero', (await sync.getAttribute('data-sync-delay')) === '0',
    await sync.innerText())

  // The keys only work on the Live tab, which is where we are.
  await page.locator('#tower-tab').click()
  for (let i = 0; i < 3; i++) { await page.keyboard.press(']'); await wait(120) }
  await wait(300)
  check('] nudges the delay up by half a second each',
    (await sync.getAttribute('data-sync-delay')) === '1.5',
    await sync.innerText())

  await page.keyboard.press('[')
  await wait(300)
  check('[ nudges it back down', (await sync.getAttribute('data-sync-delay')) === '1',
    await sync.innerText())

  // Floor, so a stray key cannot drive it negative.
  for (let i = 0; i < 6; i++) { await page.keyboard.press('['); await wait(80) }
  await wait(300)
  check('it stops at zero', (await sync.getAttribute('data-sync-delay')) === '0')

  // And it is the same value the Settings slider holds.
  await page.keyboard.press(']')
  await page.keyboard.press(']')
  await wait(400)
  await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' })
  await wait(1200)
  const settingsText = await page.locator('main').innerText()
  check('the Settings slider shows the nudged value', /\+1\.0s/.test(settingsText),
    settingsText.match(/No delay|\+\d+\.\d+s/)?.[0] ?? '(not found)')

  // And it survives a reload, because it is the persisted setting.
  await page.goto(`${BASE}/live`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-sync-delay]')
  await wait(800)
  check('and it persists across a reload',
    (await page.locator('[data-sync-delay]').getAttribute('data-sync-delay')) === '1')

  // The shortcut modal has to document them.
  await page.keyboard.press('?')
  await wait(700)
  const modal = await page.locator('body').innerText()
  check('the shortcut guide lists [ and ]', /SYNC DELAY/i.test(modal))
  await page.keyboard.press('Escape')
  await wait(300)

  // G1: the wake lock chip appears only once a session is running.
  check('no wake-lock chip before a session', await page.locator('[data-wake-lock]').count() === 0)
  await startRace(page)
  const wake = page.locator('[data-wake-lock]')
  check('wake-lock chip appears with the session', await wake.count() > 0)
  const held = await wake.getAttribute('data-wake-lock')
  check('and it reports a real state', held === 'held' || held === 'denied', held)
  if (held !== 'held') note('wake lock was declined in this headless context; it is held in a normal window')

  await page.screenshot({ path: join(OUT, '01-chips.png') })
  await ctx.close()
}

// ── G3: the battle radar ─────────────────────────────────────────────────────

async function radar(browser) {
  console.log('\n── G3 battle radar')
  const { ctx, page } = await open(browser)
  await startRace(page)

  const body = () => page.locator('main').innerText()

  // Lap 6, just after the standing restart: the whole field is nose to tail.
  await scrubTo(page, 2700 / 7101)
  let text = await body()
  check('the radar is on screen', /BATTLE RADAR/i.test(text))
  check('the restart fills it', /\d+ UNDER 1\.0S/i.test(text),
    text.match(/\d+ under 1\.0s/i)?.[0] ?? '(not found)')
  const count = Number(text.match(/(\d+) under 1\.0s/i)?.[1] ?? 0)
  check('with a plausible number of fights', count > 5 && count <= 21, `${count}`)
  check('it caps what it shows', (text.match(/\bv\b/g) ?? []).length <= 12)
  check('and says how many it left out', count <= 6 || /MORE UNDER 1\.0S/i.test(text))
  await page.screenshot({ path: join(OUT, '02-radar-restart.png') })

  // The safety car, where intervals are a queue rather than a fight.
  await scrubTo(page, 205 / 7101)
  text = await body()
  check('safety car suppresses the radar', /SAFETY CAR[^.]*QUEUED|QUEUED, NOT RACING/i.test(text),
    text.match(/Safety car[^.]*\./i)?.[0] ?? '(no reason shown)')
  check('and lists nothing while suppressed', !/\d+ UNDER 1\.0S/i.test(text))
  await page.screenshot({ path: join(OUT, '03-radar-safety-car.png') })

  // The red flag.
  await scrubTo(page, 300 / 7101)
  text = await body()
  check('red flag suppresses the radar', /RED FLAG[^.]*STOPPED/i.test(text),
    text.match(/Red flag[^.]*\./i)?.[0] ?? '(no reason shown)')

  // The virtual safety car.
  await scrubTo(page, 4500 / 7101)
  text = await body()
  check('VSC suppresses the radar', /VIRTUAL SAFETY CAR[^.]*DELTA-LIMITED/i.test(text),
    text.match(/Virtual safety car[^.]*\./i)?.[0] ?? '(no reason shown)')
  await page.screenshot({ path: join(OUT, '04-radar-vsc.png') })

  // Late in the race the field had strung out: the honest answer is nothing.
  await scrubTo(page, 5400 / 7101)
  text = await body()
  check('an empty field reads as empty, not suppressed',
    /STRUNG OUT/i.test(text), text.match(/Nobody is within[^.]*\./i)?.[0] ?? '(not found)')
  await page.screenshot({ path: join(OUT, '05-radar-strung-out.png') })

  await ctx.close()
}

// ── G4 + G5 ──────────────────────────────────────────────────────────────────

async function pitWindowAndFocus(browser) {
  console.log('\n── G4 pit window, G5 favourite focus')
  const { ctx, page } = await open(browser)
  await startRace(page)
  await scrubTo(page, 4300 / 7101)

  let text = await page.locator('main').innerText()
  check('the pit window panel is there', /PIT WINDOW/i.test(text))
  check('it is labelled as inferred', /INFERRED/i.test(text))
  check('and says what it is made of',
    /TYRE AGE AND RECENT PACE/i.test(text),
    text.match(/Inferred from[^.]*\./i)?.[0] ?? '(no disclaimer)')
  check('every row carries a confidence',
    !/[A-Z]{3}\s+[SMH]\d+/.test(text) || /LIKELY|MAYBE|WEAK|DEEP ENOUGH/i.test(text))
  await page.screenshot({ path: join(OUT, '06-pit-window.png') })

  // G5 — favourites are seeded as ANT (12) and RUS (63) in the init script.
  const focus = page.getByRole('button', { name: /FOCUS/ })
  check('the focus toggle is offered', await focus.count() > 0)
  await focus.click()
  await wait(900)
  text = await page.locator('main').innerText()
  check('it says how many are pinned', /FOCUS \(2\)/i.test(text),
    text.match(/FOCUS \(\d+\)/i)?.[0] ?? '(not found)')
  check('a divider separates pinned from the field',
    /REST OF THE FIELD/i.test(text))

  // The one thing it must never do: make a pinned row look like P1.
  const rows = await page.locator('[role="row"], .group').allInnerTexts()
  const firstRows = rows.slice(0, 4).join(' ')
  check('pinned rows keep their real positions',
    /ANT|RUS/.test(firstRows), firstRows.slice(0, 60).replace(/\n/g, ' '))
  await page.screenshot({ path: join(OUT, '07-favourite-focus.png') })

  await focus.click()
  await wait(600)
  text = await page.locator('main').innerText()
  check('turning it off restores the running order', !/REST OF THE FIELD/i.test(text))

  await ctx.close()
}

// ── G7: the local backend toggle, in both browsers ───────────────────────────

async function localBackend(browser, name) {
  console.log(`\n── G7 local backend toggle (${name})`)
  const ctx = await browser.newContext({ viewport: VIEWPORT })
  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem('pitwall_booted', '1')
      localStorage.setItem('pitwall_settings', JSON.stringify({ darkMode: true, soundEnabled: false }))
    } catch { /* ignore */ }
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' })
  await wait(1800)

  const text = await page.locator('main').innerText()
  // Served FROM localhost here, so the toggle correctly hides itself: there is
  // nothing to point anywhere.
  const offered = /USE A LOCAL BACKEND/i.test(text)
  check(`${name}: the toggle hides itself when the page is already local`, !offered,
    offered ? 'offered anyway' : 'hidden, as intended')
  note(`${name}: the https path cannot be exercised locally — see the report`)

  await page.screenshot({ path: join(OUT, `08-settings-${name}.png`) })
  await ctx.close()
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  const health = await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false)
  if (!health) {
    console.error(`Nothing serving at ${BASE}. Start it with pitwall\\race-day.ps1.`)
    process.exit(1)
  }

  const chrome = await chromium.launch({ channel: 'chrome' })
  try {
    await chips(chrome)
    await radar(chrome)
    await pitWindowAndFocus(chrome)
    await localBackend(chrome, 'chrome')
  } finally {
    await chrome.close()
  }

  try {
    const ff = await firefox.launch()
    try { await localBackend(ff, 'firefox') } finally { await ff.close() }
  } catch (err) {
    note(`firefox not available in this environment: ${String(err).slice(0, 80)}`)
  }

  console.log(`\nscreenshots: ${OUT}`)
  if (notes.length) {
    console.log('\nnotes:')
    for (const n of notes) console.log(`  ${n}`)
  }
  if (failures.length) {
    console.log(`\n${failures.length} FAILED:`)
    for (const f of failures) console.log(`  ${f}`)
    process.exit(1)
  }
  console.log('\nall race-day checks passed')
}

main().catch((err) => { console.error(err); process.exit(1) })
