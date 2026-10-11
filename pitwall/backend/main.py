"""
main.py — PITWALL FastAPI backend.

Endpoints:
  GET  /health                        — health check
  GET  /api/current-session           — current OpenF1 session key
  WS   /ws                           — live timing WebSocket
  GET  /api/circuit-info/{article}    — Wikipedia circuit summary proxy

Architecture:
  SignalR thread → asyncio.Queue → broadcaster → all WebSocket clients
"""
import asyncio
import functools
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone

import requests as req_sync

import httpx
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from db import (api_cache_get, api_cache_set, cache_get_all,
                cache_prune_expired, cache_set, init_db)
from scheduler import start_scheduler
from signalr_client import get_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

WIKI_USER_AGENT = "PITWALL/0.1 (pitwall-f1-dashboard; personal project)"

# ── Shared state ──────────────────────────────────────────────────────────────
message_queue: asyncio.Queue = asyncio.Queue()
connected_clients: set[WebSocket] = set()
_background_tasks: set[asyncio.Task] = set()   # prevent GC of running tasks


# ── Broadcaster coroutine — runs for the lifetime of the app ─────────────────
async def broadcaster():
    """
    Reads cleaned envelopes from message_queue and:
    1. Persists to SQLite cache (so late-joining clients get current state)
    2. Broadcasts to all connected WebSocket clients
    """
    logger.info("Broadcaster started")
    while True:
        envelope: dict = await message_queue.get()
        msg_type = envelope.get("type", "")

        # Cache (skip car_data — too noisy to persist)
        if msg_type != "car_data":
            await cache_set(msg_type, envelope)

        # Broadcast
        if connected_clients:
            payload = json.dumps(envelope)
            dead: set[WebSocket] = set()
            for ws in list(connected_clients):
                try:
                    await ws.send_text(payload)
                except Exception:  # noqa: BLE001
                    dead.add(ws)
            connected_clients.difference_update(dead)

        message_queue.task_done()


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    await cache_prune_expired()
    logger.info("DB initialised and pruned")

    # Start broadcaster — store in set to prevent premature GC
    task = asyncio.create_task(broadcaster())
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    logger.info("Broadcaster task created")

    # Start scheduler (auto-starts SignalR client near session times)
    loop = asyncio.get_running_loop()
    start_scheduler(loop, message_queue)

    yield

    # Shutdown — SignalR client stops with scheduler
    logger.info("PITWALL backend shutting down")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="PITWALL Backend", version="0.4.0", lifespan=lifespan)

# 127.0.0.1 and localhost are different origins to the browser, and the dev
# server is reachable on both. Omitting the 127.0.0.1 forms meant opening the
# app on 127.0.0.1:5173 had every backend call blocked by CORS.
_cors_env = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:4173,"
    "http://127.0.0.1:5173,http://127.0.0.1:4173",
)
_cors_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {"status": "ok", "clients": len(connected_clients)}


OPENF1_BASE = "https://api.openf1.org/v1"


async def _resolve_openf1_session(client: httpx.AsyncClient, year: int) -> dict:
    """
    Resolve the live-or-most-recent OpenF1 session for `year`.

    Returns {session_key, session_name, session_type, circuit_short_name, date_start}
    or {} when OpenF1 is unreachable / has no sessions yet.

    This exists because /api/current-session used to return the Jolpica *round
    number* as "session_key". Callers (RadioTab, the OpenF1 hooks) pass that
    straight to OpenF1 as ?session_key=, where round 17 means nothing — so every
    OpenF1-backed feature silently returned no data. OpenF1 session keys are
    five-digit identifiers unrelated to round numbers.
    """
    try:
        resp = await client.get(f"{OPENF1_BASE}/sessions", params={"year": year})
        resp.raise_for_status()
        sessions = resp.json()
    except Exception as exc:  # noqa: BLE001
        logger.warning("OpenF1 session lookup failed: %s", exc)
        return {}

    if not isinstance(sessions, list) or not sessions:
        return {}

    now = datetime.now(timezone.utc)

    def _dt(value):
        try:
            return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return None

    # Grace past the scheduled end before a session stops counting as running.
    #
    # This was two hours, which is why a finished race stayed "live": the
    # Singapore GP ended at 14:00 UTC and the endpoint still reported
    # is_live=true at 14:54. Red-flagged sessions do overrun, but the right
    # signal for that is the SignalR feed still streaming — which the client
    # already has and weighs above this flag (see utils/sessionLifecycle.js).
    # A generous clock window is a bad proxy for "probably still going".
    live_grace = timedelta(minutes=15)

    live, past = None, []
    for sess in sessions:
        if not isinstance(sess, dict) or sess.get("is_cancelled"):
            continue
        start_dt, end_dt = _dt(sess.get("date_start")), _dt(sess.get("date_end"))
        if start_dt is None:
            continue
        if end_dt is not None and start_dt <= now <= end_dt + live_grace:
            live = sess
            break
        if start_dt <= now:
            past.append((start_dt, sess))

    chosen = live or (max(past, key=lambda pair: pair[0])[1] if past else None)
    if not chosen:
        return {}

    end_dt = _dt(chosen.get("date_end"))
    seconds_since_end = (now - end_dt).total_seconds() if end_dt else None

    return {
        "session_key":        chosen.get("session_key"),
        "session_name":       chosen.get("session_name"),
        "session_type":       chosen.get("session_type"),
        "circuit_short_name": chosen.get("circuit_short_name"),
        # Both bounds are returned so the client can resolve the session
        # lifecycle itself (running / provisional / results pending) instead of
        # inferring it from stale timing rows.
        "date_start":         chosen.get("date_start"),
        "date_end":           chosen.get("date_end"),
        "seconds_since_end":  seconds_since_end,
        "is_live":            live is not None,
    }


@app.get("/api/current-session")
async def current_session():
    """
    Resolve the current or most-recent session.

    Jolpica (free, no auth) supplies the race weekend: round, circuit, race name.
    OpenF1 (free, no auth) supplies the real `session_key` used by every
    /api/openf1/* call.

    Returns:
      session_key          — OpenF1 session key, or None. Pass this to OpenF1.
      openf1_session_key   — same value, named explicitly.
      round                — Jolpica round number. NOT an OpenF1 session key.
      date_start/date_end  — scheduled bounds of the resolved session (ISO).
      seconds_since_end    — negative while the session is yet to end.
      is_live              — within [date_start, date_end + 15 min]. ADVISORY:
                             the client weighs the live SignalR phase above this
                             so an overrunning red-flagged session is handled.
      session_name, session_type, circuit, circuit_name, race_name, year
    """
    today = date.today()
    year = today.year
    today_str = today.isoformat()

    async with httpx.AsyncClient(timeout=10) as client:
        openf1 = await _resolve_openf1_session(client, year)

        try:
            resp = await client.get(f"https://api.jolpi.ca/ergast/f1/{year}.json?limit=100")
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Jolpica session fetch failed: %s", exc)
            # OpenF1 alone is still enough to key the OpenF1-backed panels.
            return {
                "session_key":        openf1.get("session_key"),
                "openf1_session_key": openf1.get("session_key"),
                "session_name":       openf1.get("session_name"),
                "session_type":       openf1.get("session_type"),
                "round":              None,
                "circuit":            None,
                "year":               year,
                "is_live":            openf1.get("is_live", False),
                "date_start":         openf1.get("date_start"),
                "date_end":           openf1.get("date_end"),
                "seconds_since_end":  openf1.get("seconds_since_end"),
                "source":             "openf1_only",
                "error":              str(exc),
            }

    races = data.get("MRData", {}).get("RaceTable", {}).get("Races", [])
    if not races:
        return {
            "session_key":        openf1.get("session_key"),
            "openf1_session_key": openf1.get("session_key"),
            "round":              None,
            "year":               year,
            "source":             "no_sessions",
        }

    # Current weekend = FP1 date .. race date inclusive.
    matched = None
    for race in races:
        race_date = (race.get("date") or "")[:10]
        fp1_date = (race.get("FirstPractice", {}).get("date") or race_date)[:10]
        if fp1_date <= today_str <= race_date:
            matched = race
            break

    if not matched:
        past = [r for r in races if (r.get("date") or "")[:10] <= today_str]
        matched = past[-1] if past else races[0]

    round_num = int(matched.get("round", 0) or 0)
    circuit = matched.get("Circuit", {})

    # Prefer OpenF1's own session naming; fall back to the Jolpica schedule.
    session_name = openf1.get("session_name")
    if not session_name:
        schedule = [
            ("Practice 1",        matched.get("FirstPractice", {})),
            ("Practice 2",        matched.get("SecondPractice", {})),
            ("Practice 3",        matched.get("ThirdPractice", {})),
            ("Sprint Qualifying", matched.get("SprintQualifying", {})),
            ("Sprint",            matched.get("Sprint", {})),
            ("Qualifying",        matched.get("Qualifying", {})),
            ("Race",              {"date": matched.get("date")}),
        ]
        session_name = "Race"
        for label, sess in reversed(schedule):
            sess_date = (sess.get("date") or "")[:10]
            if sess_date and sess_date <= today_str:
                session_name = label
                break

    return {
        "session_key":        openf1.get("session_key"),
        "openf1_session_key": openf1.get("session_key"),
        "session_name":       session_name,
        "session_type":       openf1.get("session_type"),
        "round":              round_num,
        "circuit":            circuit.get("circuitId"),
        "circuit_name":       circuit.get("circuitName"),
        "race_name":          matched.get("raceName"),
        "year":               year,
        "is_live":            openf1.get("is_live", False),
        "date_start":         openf1.get("date_start"),
        "date_end":           openf1.get("date_end"),
        "seconds_since_end":  openf1.get("seconds_since_end"),
        "source":             "jolpica+openf1" if openf1.get("session_key") else "jolpica",
    }


@app.get("/api/openf1/status")
async def openf1_status():
    """
    Live reachability probe for OpenF1.

    This used to hardcode {"reachable": False, "note":
    "openf1_requires_subscription_since_2026"}. That was wrong: OpenF1's
    historical endpoints (/drivers, /laps, /stints, /pit, /location,
    /intervals, /position, /session_result, /team_radio) all answer 200 with no
    API key — verified against 2026 sessions on 2026-10-11. Acting on the false
    assumption had disabled every OpenF1-backed feature in the app.

    Live *real-time* streaming still comes from the F1 SignalR feed; OpenF1 is
    used for post-session and replay data.
    """
    async with httpx.AsyncClient(timeout=6) as client:
        try:
            resp = await client.get(f"{OPENF1_BASE}/sessions", params={"year": date.today().year})
            ok = resp.status_code == 200
            return {
                "reachable": ok,
                "status":    resp.status_code,
                "note":      "historical endpoints are free, no key required",
            }
        except Exception as exc:  # noqa: BLE001
            return {"reachable": False, "status": None, "note": str(exc)}


@app.get("/api/openf1/{path:path}")
async def openf1_proxy(path: str, request: Request):
    """
    Transparent proxy for the OpenF1 API (avoids browser CORS).
    Historical endpoints are free and need no API key — verified 2026-10-11.
    Real-time streaming still comes from the F1 SignalR feed.

    Frontend calls: GET /api/openf1/v1/stints?session_key=123
    Backend calls:  GET https://api.openf1.org/v1/stints?session_key=123
    """
    from starlette.responses import Response

    params = dict(request.query_params)
    url = f"https://api.openf1.org/{path}"

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(url, params=params)
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                media_type=resp.headers.get("content-type", "application/json"),
            )
        except Exception as exc:
            logger.warning("OpenF1 proxy error: %s", exc)
            return Response(
                content=json.dumps({"error": str(exc)}),
                status_code=502,
                media_type="application/json",
            )


# ── Driver career statistics ──────────────────────────────────────────────────

JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1"

# Jolpica rate-limits bursts: measured 2026-10-11, roughly 12 concurrent
# requests succeed and the rest return 429, with no Retry-After or
# X-RateLimit headers to pace against.
#
# A full career profile is ~28 requests for a 20-season driver. Issuing them
# from the browser meant every profile view risked tripping the limit, and the
# page showed its "could not fetch" notice in normal use. Doing it here instead
# means ONE origin making the calls, with a real cache in front, so the limit is
# hit rarely rather than routinely.
_JOLPICA_SEM = asyncio.Semaphore(4)
_JOLPICA_RETRY_DELAYS = (0.8, 2.0, 4.0, 7.0)

# Jolpica limits by RATE, not just concurrency: a semaphore of 4 still lets
# four requests leave back to back, and a 20-season profile then trips 429s
# mid-run (observed 2023/2024/2025 all rejected in the same 200ms window).
# Pacing the START of each request keeps a cold profile inside the limit, so
# the retry path stays an exception rather than the norm.
_JOLPICA_MIN_INTERVAL = 0.22   # seconds between request starts (~4.5 req/s)
_jolpica_gate = asyncio.Lock()
_jolpica_next_at = 0.0


async def _jolpica_pace() -> None:
    """Block until this caller's turn in the global request schedule."""
    global _jolpica_next_at
    async with _jolpica_gate:
        now = asyncio.get_running_loop().time()
        wait = max(0.0, _jolpica_next_at - now)
        _jolpica_next_at = max(now, _jolpica_next_at) + _JOLPICA_MIN_INTERVAL
    if wait:
        await asyncio.sleep(wait)

CAREER_TTL_HISTORIC = 24 * 3600   # a retired driver's totals never change
CAREER_TTL_CURRENT = 30 * 60      # an active driver's do, every race weekend


async def _jolpica_get(client: httpx.AsyncClient, path: str) -> dict | None:
    """GET a Jolpica path with concurrency capped and 429/5xx backoff."""
    async with _JOLPICA_SEM:
        for attempt in range(len(_JOLPICA_RETRY_DELAYS) + 1):
            await _jolpica_pace()
            try:
                resp = await client.get(f"{JOLPICA_BASE}{path}")
            except Exception as exc:  # noqa: BLE001
                logger.debug("Jolpica %s transport error: %s", path, exc)
                if attempt >= len(_JOLPICA_RETRY_DELAYS):
                    return None
                await asyncio.sleep(_JOLPICA_RETRY_DELAYS[attempt])
                continue

            if resp.status_code == 200:
                try:
                    return resp.json()
                except Exception:  # noqa: BLE001
                    return None

            transient = resp.status_code == 429 or resp.status_code >= 500
            if not transient or attempt >= len(_JOLPICA_RETRY_DELAYS):
                logger.debug("Jolpica %s -> HTTP %d", path, resp.status_code)
                return None

            retry_after = resp.headers.get("retry-after")
            try:
                delay = float(retry_after) if retry_after else _JOLPICA_RETRY_DELAYS[attempt]
            except (TypeError, ValueError):
                delay = _JOLPICA_RETRY_DELAYS[attempt]
            await asyncio.sleep(delay)
    return None


async def _jolpica_count(client: httpx.AsyncClient, path: str) -> tuple[int | None, bool]:
    """
    Count-only query: read MRData.total instead of paginating the rows.

    Returns (value, ok). `ok` distinguishes a genuine zero from a failed
    request — they must never render the same.
    """
    data = await _jolpica_get(client, path)
    if not data:
        return None, False
    try:
        return int(data["MRData"]["total"]), True
    except (KeyError, TypeError, ValueError):
        return None, False


@app.get("/api/driver/{driver_id}/career")
async def driver_career(driver_id: str):
    """
    Aggregate one driver's career and per-season record.

    Partial data yields null totals, never a wrong number. In particular a
    championship count derived from an incomplete season list would be wrong
    rather than merely incomplete (a missing season is indistinguishable from a
    non-title season), so it is reported as null with `partial: true` and the
    failures named in `missing`.
    """
    if not driver_id or len(driver_id) > 64 or "/" in driver_id:
        return {"error": "invalid driver id"}

    cache_key = f"career:{driver_id}"
    cached = await api_cache_get(cache_key)
    if cached:
        cached["cached"] = True
        return cached

    season = date.today().year

    async with httpx.AsyncClient(timeout=20) as client:
        profile_json, seasons_json = await asyncio.gather(
            _jolpica_get(client, f"/drivers/{driver_id}.json"),
            _jolpica_get(client, f"/drivers/{driver_id}/seasons.json?limit=100"),
        )

        drivers = (profile_json or {}).get("MRData", {}).get("DriverTable", {}).get("Drivers", [])
        if not drivers:
            return {"error": "driver not found", "driverId": driver_id}
        profile = drivers[0]

        seasons = [
            s.get("season")
            for s in (seasons_json or {}).get("MRData", {}).get("SeasonTable", {}).get("Seasons", [])
            if s.get("season")
        ]

        count_paths = [
            f"/drivers/{driver_id}/results.json?limit=1",
            f"/drivers/{driver_id}/results/1.json?limit=1",
            f"/drivers/{driver_id}/results/2.json?limit=1",
            f"/drivers/{driver_id}/results/3.json?limit=1",
            f"/drivers/{driver_id}/qualifying/1.json?limit=1",
            f"/drivers/{driver_id}/fastest/1/results.json?limit=1",
        ]
        counts = await asyncio.gather(*(_jolpica_count(client, p) for p in count_paths))
        (races, races_ok), (wins, wins_ok), (p2, p2_ok), (p3, p3_ok),             (poles, poles_ok), (fl, fl_ok) = counts

        async def _season_row(year: str):
            data = await _jolpica_get(client, f"/{year}/drivers/{driver_id}/driverstandings.json")
            if data is None:
                return year, None, True   # request failed
            lists = data.get("MRData", {}).get("StandingsTable", {}).get("StandingsLists", [])
            if not lists or not lists[0].get("DriverStandings"):
                # A season with no classified standing is legitimate — e.g. an
                # FP1-only appearance. Not a failure.
                return year, None, False
            st = lists[0]["DriverStandings"][0]
            ctors = st.get("Constructors") or []
            ctor = ctors[-1] if ctors else {}
            try:
                position = int(st.get("position"))
            except (TypeError, ValueError):
                position = None
            try:
                points = float(st.get("points", 0))
            except (TypeError, ValueError):
                points = 0.0
            try:
                wins_n = int(st.get("wins", 0))
            except (TypeError, ValueError):
                wins_n = 0
            return year, {
                "season": year,
                "position": position,
                "points": points,
                "wins": wins_n,
                "team": ctor.get("name"),
                "teamId": ctor.get("constructorId"),
            }, False

        season_results = await asyncio.gather(*(_season_row(y) for y in seasons))

    rows = [row for _, row, _ in season_results if row]
    season_failures = sum(1 for _, _, failed in season_results if failed)
    rows.sort(key=lambda r: int(r["season"]))

    current = next((r for r in rows if r["season"] == str(season)), None)

    seasons_complete = season_failures == 0
    championships = (
        sum(1 for r in rows if r["position"] == 1) if seasons_complete else None
    )
    podiums = (wins + p2 + p3) if (wins_ok and p2_ok and p3_ok) else None

    missing = [
        label for ok, label in (
            (races_ok, "starts"),
            (wins_ok, "wins"),
            (podiums is not None, "podiums"),
            (poles_ok, "poles"),
            (fl_ok, "fastest laps"),
            (seasons_complete, "championships"),
        ) if not ok
    ]

    payload = {
        "driverId": driver_id,
        "profile": profile,
        "seasons": rows,
        "current": current,
        "career": {
            "races": races,
            "wins": wins,
            "podiums": podiums,
            "poles": poles,
            "fastestLaps": fl,
            "championships": championships,
            "seasonCount": len(rows) if seasons_complete else None,
        },
        "partial": bool(missing),
        "missing": missing,
        "seasonFailures": season_failures,
        "expectedSeasons": len(seasons),
        "cached": False,
    }

    # Don't cache a partial answer for long — it should heal on the next view.
    if missing:
        ttl = 120.0
    else:
        ttl = CAREER_TTL_CURRENT if current else CAREER_TTL_HISTORIC
    await api_cache_set(cache_key, payload, ttl)

    return payload


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    connected_clients.add(ws)
    client_host = ws.client.host if ws.client else "unknown"
    logger.info("WS connected: %s (total: %d)", client_host, len(connected_clients))

    try:
        # Send all currently valid cached data so a fresh page load has latest telemetry
        cached = await cache_get_all()
        if cached:
            for envelope in cached.values():
                await ws.send_text(json.dumps(envelope))
            logger.info("Sent %d cached messages to %s", len(cached), client_host)

        # If no active session state is cached, send explicit PRE state so client knows session isn't live
        if "session" not in cached:
            await ws.send_text(json.dumps({
                "type": "session",
                "timestamp": "",
                "data": {"name": "", "status": "", "lap": None,
                         "total_laps": None, "clock": "", "phase": "PRE"},
            }))
        if "timing" not in cached:
            await ws.send_text(json.dumps({
                "type": "timing",
                "timestamp": "",
                "data": {"drivers": []},
            }))
        if "tyres" not in cached:
            await ws.send_text(json.dumps({
                "type": "tyres",
                "timestamp": "",
                "data": {"drivers": []},
            }))

        # Keep connection alive — wait for client messages (pong etc.)
        while True:
            try:
                await asyncio.wait_for(ws.receive_text(), timeout=30)
            except asyncio.TimeoutError:
                # Send a ping to check if client is still alive
                await ws.send_text(json.dumps({"type": "ping"}))

    except WebSocketDisconnect:
        logger.info("WS disconnected: %s", client_host)
    except Exception:
        logger.exception("WS error for %s", client_host)
    finally:
        connected_clients.discard(ws)


@app.get("/api/circuit-info/{article}")
async def circuit_info(article: str):
    """
    Proxy Wikipedia REST API summary for an F1 circuit.
    Uses requests (not httpx) — Wikipedia specifically works with requests
    and returns 403 with httpx defaults.
    Returns: {title, description, extract, thumbnail_url}
    """
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{article}"
    wiki_headers = {
        "User-Agent": "PITWALL/1.0 (pitwall-f1-dashboard; personal non-commercial)",
        "Accept": "application/json",
    }

    def _fetch():
        try:
            r = req_sync.get(url, headers=wiki_headers, timeout=10)
            r.raise_for_status()
            data = r.json()
            return {
                "title":         data.get("title"),
                "description":   data.get("description"),
                "extract":       data.get("extract"),
                "thumbnail_url": (data.get("thumbnail") or {}).get("source"),
            }
        except req_sync.exceptions.HTTPError as e:
            return {"error": "Wikipedia returned %d" % e.response.status_code}
        except Exception as e:  # noqa: BLE001
            return {"error": str(e)}

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, functools.partial(_fetch))


if __name__ == "__main__":
    import uvicorn
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=False, log_level="info")
