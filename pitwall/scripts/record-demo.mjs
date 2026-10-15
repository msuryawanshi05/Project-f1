/**
 * record-demo.mjs — records the README demo GIF.
 *
 * Usage (from pitwall/):
 *   1. start the backend:   cd backend && uvicorn main:app --port 8000
 *   2. start the frontend:  cd frontend && npm run dev
 *   3. node scripts/record-demo.mjs
 *
 * Output: assets/pitwall-demo.gif
 *
 * What it records
 * ---------------
 * A real Grand Prix: the committed replay of the 2026 Italian GP at Monza,
 * driven through the same WebSocket and the same store the live feed uses.
 *
 * Earlier versions injected a fabricated race state into the store, because a
 * demo recorded during a session cannot be reproduced afterwards and would be
 * blank out of season — which is most of the year. Replay solves that problem
 * properly: it is just as deterministic, it is real timing rather than
 * plausible-looking numbers, and it demonstrates the feature instead of working
 * around its absence.
 *
 * Needs the replay data built (scripts/build-replay.py) and the backend
 * serving it. Monza was chosen for the recording as well as the feature: a
 * safety car, a red flag and a virtual safety car in one race, four grid
 * penalties, and Antonelli winning from nineteenth.
 */
import { createRequire } from 'node:module'
import { mkdirSync, rmSync, readdirSync, statSync } from 'node:fs'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const here = path.dirname(fileURLToPath(import.meta.url))
const require_ = createRequire(path.join(here, '../frontend/package.json'))
const { chromium } = require_('playwright')
const ffmpeg = require_('@ffmpeg-installer/ffmpeg').path

const BASE = process.env.PITWALL_URL ?? 'http://localhost:5173'
const OUT_DIR = path.join(here, '../../assets')
const WORK = path.join(here, '.demo-tmp')
const GIF = path.join(OUT_DIR, 'pitwall-demo.gif')

// 2x for a crisp GIF after downscaling; 1280x720 output.
const VIEWPORT = { width: 1280, height: 720 }

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const REPLAY = { weekend: '2026-13-italian', session: 'race' }

/**
 * Points in the Monza race worth putting on camera, in seconds from the green
 * light. Chosen rather than played straight through: at 1x the interesting
 * parts of a two-hour race are ninety minutes apart.
 */
const BEATS = {
  earlyRestart: 2500,   // the field back up to speed after the red flag
  midRace: 4300,        // strategies diverging, the tower at its busiest
  virtualSafetyCar: 4470,
  finish: 7090,         // Antonelli takes it from nineteenth on the grid
}

async function main() {
  rmSync(WORK, { recursive: true, force: true })
  mkdirSync(WORK, { recursive: true })
  mkdirSync(OUT_DIR, { recursive: true })

  const browser = await chromium.launch({ channel: 'chrome' })
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: { dir: WORK, size: VIEWPORT },
  })
  const page = await ctx.newPage()

  // No socket interception. The old recorder dropped server frames to
  // stop the live feed's phase=PRE envelope wiping its seed mid-recording;
  // replay is server frames, and the backend already excludes replay viewers
  // from the live broadcast for exactly that reason.

  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem('pitwall_booted', '1')      // skip the boot animation
      const cur = JSON.parse(localStorage.getItem('pitwall_settings') || '{}')
      localStorage.setItem('pitwall_settings', JSON.stringify({ ...cur, darkMode: true, soundEnabled: false }))
      localStorage.setItem('pitwall_demo', '1')
    } catch {}
  })


  /** A replay command, up the same socket the UI uses. */
  const cmd = async (payload) => {
    await page.waitForFunction(
      () => Boolean(globalThis.__pitwall_store?.getState().sendCommand),
      null, { timeout: 20000 })
    await page.evaluate((p) => globalThis.__pitwall_store.getState().sendCommand(p), payload)
    await wait(250)
  }

  /**
   * Navigate, and wait for the store rather than a fixed delay.
   *
   * A fixed delay left a visible second of the between-sessions UI — "OFF
   * SEASON", empty panels — at the top of each page, which is not what the
   * demo is meant to show.
   */
  const go = async (route, settle = 400) => {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => Boolean(globalThis.__pitwall_store), null, { timeout: 20000 })
    await wait(settle)
  }

  // ── 1. Home ──
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await wait(1296)

  // ── 2. Into the replay ──
  await go('/live')
  await cmd({ cmd: 'replay.load', ...REPLAY, at: BEATS.earlyRestart })
  await wait(1872)

  // ── 3. The tower, running ──
  await cmd({ cmd: 'replay.speed', speed: 5 })
  await cmd({ cmd: 'replay.play' })
  await wait(3024)
  await page.mouse.wheel(0, 300); await wait(648)
  await page.mouse.wheel(0, -300); await wait(288)
  await cmd({ cmd: 'replay.pause' })

  // ── 4. Strategy, where the two-stops and three-stops separate ──
  await cmd({ cmd: 'replay.seek', at: BEATS.midRace })
  await wait(648)
  await page.getByRole('tab', { name: 'STRATEGY' }).click()
  await wait(1440)
  await page.mouse.wheel(0, 460); await wait(864)

  // ── 5. Telemetry, two laps on a common distance axis ──
  await page.getByRole('tab', { name: 'TELEMETRY' }).click()
  await wait(504)
  await page.evaluate(() => {
    const st = globalThis.__pitwall_store.getState()
    st.setSelectedTelemetryDriver(12)     // ANT, the winner
    st.setCompareTelemetryDriver(63)      // RUS, second
  })
  await wait(1728)

  // ── 6. The virtual safety car, on the tower ──
  await page.getByRole('tab', { name: 'TOWER' }).click()
  await wait(360)
  await cmd({ cmd: 'replay.seek', at: BEATS.virtualSafetyCar })
  await wait(1728)

  // ── 7. The flag ──
  await cmd({ cmd: 'replay.seek', at: BEATS.finish })
  await wait(1872)

  // ── 8. Standings and season detail (real Jolpica data) ──
  await page.goto(`${BASE}/standings`, { waitUntil: 'domcontentloaded' })
  await wait(1296)
  await page.goto(`${BASE}/season`, { waitUntil: 'domcontentloaded' })
  await wait(864)
  const race = page.locator('[class*="divide-y"] >> text=/Grand Prix/').first()
  if (await race.count()) { await race.click().catch(() => {}); await wait(1296) }
  else await wait(1008)

  await ctx.close()          // flushes the video
  await browser.close()

  const webm = readdirSync(WORK).find((f) => f.endsWith('.webm'))
  if (!webm) throw new Error('playwright produced no video')
  const src = path.join(WORK, webm)

  // Two-pass palette: one global palette then dithered mapping. A single pass
  // produces visible banding on the dark UI and a much larger file.
  const palette = path.join(WORK, 'palette.png')
  const vf = 'fps=10,scale=800:-1:flags=lanczos'
  await run(ffmpeg, ['-y', '-i', src, '-vf', `${vf},palettegen=max_colors=128:stats_mode=diff`, palette])
  await run(ffmpeg, ['-y', '-i', src, '-i', palette, '-lavfi',
    `${vf}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`, GIF])

  const mb = statSync(GIF).size / 1048576
  const probe = await run(ffmpeg, ['-i', GIF]).catch((e) => ({ stderr: e.stderr ?? '' }))
  const dur = /Duration: (\d+:\d+:\d+\.\d+)/.exec(probe.stderr ?? '')?.[1] ?? '?'
  console.log(`\n${GIF}`)
  console.log(`  ${mb.toFixed(2)} MB · duration ${dur}`)
  if (mb > 10) console.log('  WARNING: over the 10 MB budget — lower fps or scale in `vf`.')

  rmSync(WORK, { recursive: true, force: true })
}

main().catch((e) => { console.error(e); process.exit(1) })
