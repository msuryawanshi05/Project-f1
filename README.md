# PITWALL

A Formula 1 timing dashboard for a second screen. It streams live session timing from F1's own
feed when one is running, and otherwise serves results, standings, driver and constructor
history from free public APIs.

![PITWALL walkthrough](./assets/pitwall-demo.gif)

<sub>Recorded with [`pitwall/scripts/record-demo.mjs`](pitwall/scripts/record-demo.mjs) against a
fixed seeded race state, so it is reproducible out of season. The timing values in the GIF are
synthetic; everything the deployed app shows is real.</sub>

---

## What it does

**Live, during a session** — timing tower with gap and interval, sector times with F1's
purple/green/yellow colouring, mini-sector detail, tyre compound and age, pit stop counts, speed
traps, and a qualifying mode that switches to best-lap order with the correct knockout line.
Track map, weather, race control messages, and a telemetry tab with speed/throttle/brake/gear.

**Any time** — race results, championship standings, driver and constructor career records with
head-to-head comparison, the season calendar with circuit detail, and session history.

**What it is not** — a betting tool, a replacement for F1 TV, or an official product. It has no
account system and stores nothing about you.

## Live demo

**[project-f1.antideploy.app](https://project-f1.antideploy.app)**

Results, standings, drivers, teams, the season calendar and session history are all live there.
**Live timing is not**, and the site says so in its header: F1 blocks cloud hosts, so no deployed
instance can stream the feed. Run it locally during a session for that — see
[Limitations](#limitations).

---

## Data sources

Everything is free and unauthenticated. There are no API keys in this project.

| Source | Serves | Auth | Notes |
|---|---|---|---|
| **F1 SignalR** `livetiming.formula1.com` | Live timing, sectors, tyres, race control, track status, weather, car telemetry | none | Only while a session is running. **Blocked from most cloud hosts** — see below. |
| **Jolpica** (Ergast mirror) `api.jolpi.ca` | Calendar, results, qualifying, championship standings, driver and constructor careers back to 1950 | none | Rate limited to roughly 2.5 req/s sustained; the backend paces and caches accordingly. |
| **OpenF1** `api.openf1.org` | Driver headshots, pit lane timings, stints, lap data, team radio, intervals, GPS positions | none | Historical endpoints are free. Needs a real five-digit `session_key`, not a round number. |
| **Open-Meteo** `api.open-meteo.com` | Circuit weather forecast | none | Used on the season/circuit panels. |
| **Wikipedia REST** | Circuit summaries | none | Proxied by the backend, which sets the required `User-Agent`. |
| **Formula 1 media CDN** | Team logos, driver headshots | none | Images only, served directly to the browser. |

Circuit geometry comes from [`bacinger/f1-circuits`](https://github.com/bacinger/f1-circuits)
(OpenStreetMap-traced GeoJSON), vendored in `pitwall/frontend/public/trackmaps/`.

---

## Architecture

```
                    ┌──────────────────────────────────────────┐
  LIVE PATH         │  livetiming.formula1.com  (SignalR)      │
  (session only)    └────────────────────┬─────────────────────┘
                                         │  WebSocket, no auth
                                         │  403 from most datacenters
                    ┌────────────────────▼─────────────────────┐
                    │  FastAPI backend                         │
                    │                                          │
                    │  signalr_client.py  parse + normalise    │
                    │        │                                 │
                    │        ▼                                 │
                    │  asyncio.Queue ──► broadcaster           │
                    │        │                                 │
                    │        ├──► SQLite session cache (3 h)   │
                    │        └──► every connected browser      │
                    │                                          │
                    │  /api/driver|constructor/{id}/career     │
                    │        └─► Jolpica, paced + cached 24 h  │
                    │  /api/openf1/*   transparent proxy       │
                    │  /api/live-status  is the feed usable?   │
                    └────────────────────┬─────────────────────┘
                                         │  WebSocket + REST
                    ┌────────────────────▼─────────────────────┐
                    │  React 18 + Vite + Tailwind              │
                    │                                          │
                    │  Zustand store ◄── useWebSocket          │
                    │        │                                 │
                    │        ▼                                 │
                    │  Live · Drivers · Standings · Results    │
                    └──────────────────────────────────────────┘
                                         ▲
  REFERENCE PATH                         │  direct from the browser
  (always available)  ┌──────────────────┴─────────────────────┐
                      │  Jolpica · OpenF1 · Open-Meteo · F1 CDN│
                      └────────────────────────────────────────┘
```

The two paths are independent on purpose: the live feed going away degrades the Live tab and
nothing else.

---

## Running locally

Requires Node 18+ and Python 3.11+.

```bash
git clone https://github.com/msuryawanshi05/Project-f1.git
cd Project-f1/pitwall

# backend  →  http://localhost:8000
cd backend
python -m venv .venv && . .venv/Scripts/activate      # Windows
# python3 -m venv .venv && source .venv/bin/activate  # macOS / Linux
pip install -r requirements.txt
uvicorn main:app --port 8000

# frontend →  http://localhost:5173   (second terminal)
cd ../frontend
npm install
npm run dev
```

No configuration is needed for local use. `backend/.env` can override `HOST`, `PORT` and
`CORS_ORIGINS`; the defaults already allow both `localhost` and `127.0.0.1` on the dev ports.

### Tests

```bash
cd pitwall/backend && python test_clean_timing.py && python test_payload_parsing.py && python test_live_status.py
cd ../frontend && for t in sessionLifecycle qualifyingUtils teamColours trackStatus; do node src/utils/$t.test.mjs; done
```

They cover the parts where being wrong is invisible: F1's mini-sector colour codes, the
qualifying knockout maths, session lifecycle transitions, contrast ratios, and the track status
banner.

---

## Limitations

**Live timing only exists during a session.** F1 publishes the feed from roughly five minutes
before a session until shortly after it ends. Outside that window the Live tab shows a countdown
to the next session, and the tower is empty — that is the feed being absent, not a fault.

**F1's live timing refuses connections from most cloud hosts.** `livetiming.formula1.com` returns
403 to VPS, CI and serverless IP ranges; it generally only answers residential connections. A
deployed instance therefore cannot stream live timing, and the app says so in the UI rather than
appearing broken ([`/api/live-status`](pitwall/backend/main.py)). Running it on your own machine
during a session works. Everything served by Jolpica and OpenF1 is unaffected.

**Results lag the chequered flag.** Official classification appears on Jolpica minutes to hours
after a race. In between, the app shows the retained timing state as a provisional classification
for 30 minutes, then an explicit "awaiting official results" state.

**Manual Override Mode is inferred, not official.** F1 has not published a dedicated MOM channel
for 2026. The indicator derives from the hybrid deployment channel that previously carried DRS
state, and is labelled as derived in the UI.

**Some reference data is not verifiable and is left blank.** Lap records, Pirelli compound
allocations and per-circuit sector splits are `null` in `circuits.json` where no free source
publishes them. They render as "—" rather than a plausible guess.

**Single backend process.** The SignalR client and its broadcast queue are per-process, so the
backend does not scale horizontally without redesign.

---

## Deployment

`render.yaml` and `frontend/vercel.json` are committed, so both platforms can read their own
configuration. Nothing here needs a paid tier.

**Read this first.** F1's live timing refuses connections from cloud hosts (see
[Limitations](#limitations)), so a deployed instance will serve results, standings, drivers,
teams, the season calendar and session history correctly, but will **not** stream live timing.
The app detects this and says so in its header rather than appearing broken. If you want live
timing, run it locally during a session.

### Option A — one service (what the live demo uses)

The backend can serve the built frontend from its own origin, which avoids CORS entirely and
needs one deployment instead of two. Build the frontend, copy `dist/` to
`pitwall/backend/static_frontend/`, and deploy the backend; `main.py` picks the directory up if
it exists and serves the SPA, falling back to `index.html` for client-side routes.

```bash
cd pitwall/frontend && npm run build
cp -r dist ../backend/static_frontend
```

Set `VITE_API_URL` and `VITE_WS_URL` to the deployment's own origin before building, since the
API and the socket are on the same host.

### Option B — Vercel + Render

Two services, with the frontend on a CDN. `render.yaml` and `frontend/vercel.json` are committed.

### 1. Backend on Render

1. Render dashboard → **New** → **Blueprint** → select this repository. It picks up
   `render.yaml`, which sets the Python runtime, `rootDir`, build and start commands, and the
   `/health` check.
2. When prompted for `CORS_ORIGINS`, leave it blank for now — you need the Vercel URL first.
3. Deploy, and note the service URL, e.g. `https://pitwall-backend.onrender.com`.

The start command pins `--workers 1` deliberately: the SignalR client and its in-process
broadcast queue are per-process, so a second worker would open a second upstream connection and
serve a different view of the session.

### 2. Frontend on Vercel

1. Vercel → **Add New** → **Project** → import this repository.
2. Set **Root Directory** to `pitwall/frontend`. Vercel reads `vercel.json` for the Vite build
   and the SPA rewrite (without that rewrite, every route except `/` 404s on refresh).
3. Add two environment variables, using the Render URL from step 1:

   | Name | Value |
   |---|---|
   | `VITE_API_URL` | `https://<your-service>.onrender.com` |
   | `VITE_WS_URL` | `wss://<your-service>.onrender.com/ws` |

   `wss://`, not `ws://` — a browser on HTTPS refuses an insecure WebSocket, and the failure is
   silent apart from a console error.

   These are build-time variables, so changing them needs a redeploy, not just a restart.
4. Deploy and note the URL.

### 3. Close the loop

Set `CORS_ORIGINS` on the Render service to the exact Vercel origins, comma separated:

```
https://your-app.vercel.app,https://your-app-git-main-you.vercel.app
```

Scheme included, no trailing slash, and include the preview domain if you want previews to work.
A mismatch shows up as every API call failing with a CORS error while the page itself loads fine.

### 4. Verify

- `https://<service>.onrender.com/health` → `{"status":"ok", ...}`
- `https://<service>.onrender.com/api/live-status` → expect
  `"availability": "unavailable_here"` from a cloud host; that is the correct result, not a fault.
- Open the Vercel URL. The first load after inactivity takes up to a minute while Render wakes
  the container — the header shows `CONNECTING…` then `WAKING…` rather than reporting offline.
- Check `/drivers`, `/teams`, `/standings`, `/results` and `/season` all load and survive a
  refresh (that exercises the SPA rewrite).

## Licence

MIT — see [LICENSE](LICENSE).

Unofficial and non-commercial. Not associated with or endorsed by Formula 1, the FIA, or any
team. F1 marks belong to Formula One Licensing BV; logos and driver images are served from F1's
media CDN and remain the property of their owners.
