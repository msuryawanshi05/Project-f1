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
 * Why it seeds its own data
 * -------------------------
 * The walkthrough runs against a fixed seed injected into the Zustand store,
 * not against whatever happens to be on the live feed. A demo recorded during a
 * session cannot be reproduced afterwards, would look different every time, and
 * would be blank out of season — which is most of the year. Seeding makes the
 * recording deterministic and re-runnable after any UI change.
 *
 * The seed is a plausible race state, not real timing. Nothing it produces is
 * presented in the app as live data: the recording exists to show the interface,
 * and the README says the GIF uses seeded data.
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

/** A fixed, plausible mid-race state. Not real timing — see the header. */
const SEED = `(() => {
  const st = globalThis.__pitwall_store.getState()
  const grid = [
    [1,'NOR','McLaren'],[16,'LEC','Ferrari'],[12,'ANT','Mercedes'],[3,'VER','Red Bull Racing'],
    [44,'HAM','Ferrari'],[81,'PIA','McLaren'],[63,'RUS','Mercedes'],[6,'HAD','Red Bull Racing'],
    [30,'LAW','Racing Bulls'],[27,'HUL','Audi'],[41,'LIN','Racing Bulls'],[5,'BOR','Audi'],
    [31,'OCO','Haas F1 Team'],[87,'BEA','Haas F1 Team'],[23,'ALB','Williams'],[55,'SAI','Williams'],
    [10,'GAS','Alpine'],[43,'COL','Alpine'],[14,'ALO','Aston Martin'],[18,'STR','Aston Martin'],
    [11,'PER','Cadillac'],[77,'BOT','Cadillac'],
  ]
  st.setSession({ name:'Race', phase:'LIVE', lap:34, total_laps:62, status:'Started', clock:'01:12:40' })
  st.setDrivers(grid.map(([n,c,t]) => ({ number:n, code:c, team:t, full_name:c })))
  st.setTrackStatus({ status:'1', message:'AllClear' })

  const compounds = ['MEDIUM','SOFT','HARD']
  st.setTiming(grid.map(([n], i) => {
    const lap = 97.412 + i * 0.187
    const gap = i === 0 ? '' : '+' + (i * 1.84 + (i % 3) * 0.3).toFixed(3)
    return {
      number:n, driver_number:n, position:i+1,
      gap_to_leader: gap, gap_to_ahead: i === 0 ? '' : '+' + (1.84 + (i % 3) * 0.3).toFixed(3),
      last_lap_time_in_s: lap, last_lap: '1:' + (lap - 60).toFixed(3),
      best_lap_time_in_s: lap - 0.6,
      s1_time_in_s: 28.631 + i * 0.041, s2_time_in_s: 41.122 + i * 0.062, s3_time_in_s: 27.659 + i * 0.058,
      s1_colour: i === 0 ? 'purple' : (i < 4 ? 'green' : 'yellow'),
      s2_colour: i < 3 ? 'green' : 'yellow',
      s3_colour: i === 1 ? 'purple' : 'yellow',
      overall_fastest: i === 0, personal_fastest: i < 3,
      pit_count: i % 3 === 0 ? 2 : 1,
      speed_trap: 332 - i, speed_i1: 307 - i, speed_i2: 276 - i, speed_fl: 255 - i,
      in_pit:false, pitting:false, retired:false, stopped:false,
    }
  }))
  st.setTyres(grid.map(([n], i) => ({
    number:n, driver_number:n, compound: compounds[i % 3], age: 8 + (i % 14), stint_number: 2, new_tyre: true,
    stints: [
      { stint_index:0, compound:'MEDIUM', laps:22, new_tyre:true },
      { stint_index:1, compound: compounds[i % 3], laps: 8 + (i % 14), new_tyre:true },
    ],
  })))
  st.setWeather({ air_temp:30.2, track_temp:41.5, humidity:58.0, wind_speed:5.0, wind_direction:204, rainfall:false, pressure:1008 })

  // Telemetry history so the Telemetry tab has curves to draw.
  const hist = {}
  for (const [n] of grid.slice(0, 6)) {
    hist[n] = Array.from({ length: 90 }, (_, k) => {
      const ph = (k / 90) * Math.PI * 2
      return {
        speed: Math.round(180 + 120 * Math.abs(Math.sin(ph + n * 0.1))),
        rpm: Math.round(9000 + 3200 * Math.abs(Math.sin(ph))),
        n_gear: 3 + (k % 6), gear: 3 + (k % 6),
        throttle: Math.round(50 + 50 * Math.sin(ph)), brake: k % 17 === 0 ? 100 : 0,
        drs: k % 23 === 0 ? 'on' : 'available',
      }
    })
  }
  useF1StoreSetTelemetry(hist)
  st.setSelectedTelemetryDriver(1)
})()`

/** Applied separately so the walkthrough can show it arriving. */
const SAFETY_CAR = `(() => {
  const st = globalThis.__pitwall_store.getState()
  st.setTrackStatus({ status:'4', message:'SafetyCar' })
  st.addRaceControl({
    time: new Date().toISOString(), lap: 34, category:'SafetyCar', flag:'SC', scope:'Track',
    driver_number: null, message:'SAFETY CAR DEPLOYED',
  })
})()`

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

  // Connect the socket for real, then stop forwarding what the server sends.
  //
  // The handshake has to be genuine so the UI shows a true CONNECTED state.
  // But the backend re-broadcasts session state whenever the upstream feed
  // ticks, and between race weekends that state is empty with phase=PRE —
  // which calls resetLiveSession() and wipes the seed at an unpredictable
  // moment mid-recording. Letting the connection through while dropping
  // server frames gives a connected app whose state the script controls.
  await page.routeWebSocket(/.*\/ws$/, (ws) => {
    const server = ws.connectToServer()
    ws.onMessage((m) => server.send(m))   // client -> server (pongs) still flow
    server.onMessage(() => { /* server -> client: intentionally dropped */ })
  })

  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem('pitwall_booted', '1')      // skip the boot animation
      const cur = JSON.parse(localStorage.getItem('pitwall_settings') || '{}')
      localStorage.setItem('pitwall_settings', JSON.stringify({ ...cur, darkMode: true, soundEnabled: false }))
      localStorage.setItem('pitwall_demo', '1')
    } catch {}
    // carDataHistory has no public setter; the demo needs one.
    window.useF1StoreSetTelemetry = (hist) => {
      const s = globalThis.__pitwall_store
      s.setState({ carDataHistory: hist, carData: Object.fromEntries(
        Object.entries(hist).map(([k, v]) => [k, v[v.length - 1]])) })
    }
  })

  const seed = async () => { await page.evaluate(SEED); await wait(250) }

  /**
   * Navigate, then seed as soon as the store exists.
   *
   * A fixed delay left a visible window of the real (between-sessions) UI —
   * "OFF SEASON", empty panels — at the start of each page, which is not what
   * the demo is meant to show. Waiting on the store itself seeds on the first
   * render instead of a second later.
   */
  const go = async (route, settle = 150) => {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => Boolean(globalThis.__pitwall_store), null, { timeout: 15000 })
    await seed()
    await wait(settle)
  }

  // ── 1. Home ──
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await wait(1900)

  // ── 2. Live tower ──
  await go('/live')
  await wait(3000)
  await page.mouse.wheel(0, 320); await wait(800)
  await page.mouse.wheel(0, -320); await wait(300)

  // ── 3. Strategy ──
  await page.getByRole('tab', { name: 'STRATEGY' }).click()
  await wait(1800)
  await page.mouse.wheel(0, 500); await wait(1100)

  // ── 4. Telemetry ──
  await page.getByRole('tab', { name: 'TELEMETRY' }).click()
  await wait(2000)

  // ── 5. Safety car arrives, back on the tower ──
  await page.getByRole('tab', { name: 'TOWER' }).click()
  await wait(400)
  await page.evaluate(SAFETY_CAR)
  await wait(2200)

  // ── 6. Standings (real Jolpica data) ──
  await page.goto(`${BASE}/standings`, { waitUntil: 'domcontentloaded' })
  await wait(1900)

  // ── 7. Season detail (real Jolpica data) ──
  await page.goto(`${BASE}/season`, { waitUntil: 'domcontentloaded' })
  await wait(1200)
  const race = page.locator('[class*="divide-y"] >> text=/Grand Prix/').first()
  if (await race.count()) { await race.click().catch(() => {}); await wait(1900) }
  else await wait(1500)

  await ctx.close()          // flushes the video
  await browser.close()

  const webm = readdirSync(WORK).find((f) => f.endsWith('.webm'))
  if (!webm) throw new Error('playwright produced no video')
  const src = path.join(WORK, webm)

  // Two-pass palette: one global palette then dithered mapping. A single pass
  // produces visible banding on the dark UI and a much larger file.
  const palette = path.join(WORK, 'palette.png')
  const vf = 'fps=10,scale=860:-1:flags=lanczos'
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
