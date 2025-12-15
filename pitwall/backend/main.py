"""
main.py — PITWALL FastAPI backend.

Endpoints:
  GET  /health                        — health check
  WS   /ws                           — live timing WebSocket
  GET  /api/circuit-info/{article}    — Wikipedia circuit summary proxy

Architecture:
  SignalR thread → asyncio.Queue → broadcaster → all WebSocket clients
"""
import asyncio
import json
import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from db import cache_get_all, cache_set, init_db
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
                except Exception:
                    dead.add(ws)
            connected_clients.difference_update(dead)

        message_queue.task_done()


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    logger.info("DB initialised")

    # Start broadcaster — store in set to prevent premature GC
    task = asyncio.create_task(broadcaster())
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    logger.info("Broadcaster task created")

    # Start scheduler (auto-starts SignalR client near session times)
    loop = asyncio.get_event_loop()
    start_scheduler(loop, message_queue)

    yield

    # Shutdown — SignalR client stops with scheduler
    logger.info("PITWALL backend shutting down")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="PITWALL Backend", version="0.3.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {"status": "ok", "clients": len(connected_clients)}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    connected_clients.add(ws)
    client_host = ws.client.host if ws.client else "unknown"
    logger.info(f"WS connected: {client_host} (total: {len(connected_clients)})")

    try:
        # Send all currently cached data so a fresh page load isn't blank
        cached = await cache_get_all()
        if cached:
            for envelope in cached.values():
                await ws.send_text(json.dumps(envelope))
            logger.info(f"Sent {len(cached)} cached messages to {client_host}")
        else:
            # No session active — send PRE state
            await ws.send_text(json.dumps({
                "type": "session",
                "timestamp": "",
                "data": {"name": "", "status": "", "lap": None,
                         "total_laps": None, "clock": "", "phase": "PRE"},
            }))

        # Keep connection alive — wait for client to close
        while True:
            try:
                await asyncio.wait_for(ws.receive_text(), timeout=30)
            except asyncio.TimeoutError:
                # Send a ping to keep the connection alive
                await ws.send_text(json.dumps({"type": "ping"}))

    except WebSocketDisconnect:
        logger.info(f"WS disconnected: {client_host}")
    except Exception:
        logger.exception(f"WS error for {client_host}")
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
    import functools
    import requests as req

    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{article}"
    wiki_headers = {
        "User-Agent": "PITWALL/1.0 (pitwall-f1-dashboard; personal non-commercial)",
        "Accept": "application/json",
    }

    def _fetch():
        try:
            r = req.get(url, headers=wiki_headers, timeout=10)
            r.raise_for_status()
            data = r.json()
            return {
                "title":         data.get("title"),
                "description":   data.get("description"),
                "extract":       data.get("extract"),
                "thumbnail_url": (data.get("thumbnail") or {}).get("source"),
            }
        except req.exceptions.HTTPError as e:
            return {"error": f"Wikipedia returned {e.response.status_code}"}
        except Exception as e:
            return {"error": str(e)}

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, functools.partial(_fetch))
