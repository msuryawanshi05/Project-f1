"""
scheduler.py — PITWALL session scheduler.

Reads the 2026 F1 calendar from frontend/src/data/circuits.json,
schedules the SignalR client to start 5 minutes before each session,
and schedules cache_clear() 3 hours after session start.

Called from main.py lifespan on startup.
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.date import DateTrigger

from db import cache_clear
from signalr_client import get_client

logger = logging.getLogger(__name__)

# Path to the 2026 calendar file created in Phase 2
CIRCUITS_JSON = Path(__file__).parent.parent / "frontend" / "src" / "data" / "circuits.json"

# Typical session schedule relative to race date (UTC offsets will vary)
# We use Jolpica for exact times in Phase 4; here we approximate with race day
_SESSION_OFFSETS_HOURS = {
    "practice_1": -26,   # ~2 days before race (~Fri)
    "practice_2": -22,
    "practice_3": -2,    # ~Sat
    "qualifying": 1,
    "race":       24,    # race day Sun, roughly
}

_scheduler: BackgroundScheduler | None = None
_loop_ref: asyncio.AbstractEventLoop | None = None
_queue_ref: asyncio.Queue | None = None
_client_running = False


def _start_signalr():
    global _client_running
    if _client_running:
        logger.info("SignalR client already running — skipping scheduled start")
        return
    logger.info("Scheduler: starting SignalR client")
    if _loop_ref and _queue_ref:
        get_client().start(_loop_ref, _queue_ref)
        _client_running = True


def _stop_and_clear():
    global _client_running
    logger.info("Scheduler: stopping SignalR client and clearing cache")
    get_client().stop()
    _client_running = False
    if _loop_ref:
        asyncio.run_coroutine_threadsafe(cache_clear(), _loop_ref)


def _load_sessions() -> list[dict]:
    """
    Returns a list of {round, name, race_date_utc} dicts.
    race_date_utc is a timezone-aware datetime parsed from circuits.json.
    """
    sessions = []
    try:
        with open(CIRCUITS_JSON, encoding="utf-8") as f:
            circuits = json.load(f)
        for circuit in circuits:
            date_str = circuit.get("race_date") or circuit.get("date")
            if not date_str:
                continue
            try:
                # Parse ISO date — assume UTC noon if no time given
                if "T" in date_str:
                    dt = datetime.fromisoformat(date_str).replace(tzinfo=timezone.utc)
                else:
                    dt = datetime.strptime(date_str, "%Y-%m-%d").replace(
                        hour=12, tzinfo=timezone.utc
                    )
                sessions.append({
                    "round": circuit.get("round"),
                    "name":  circuit.get("name", ""),
                    "race_date_utc": dt,
                    "sprint": circuit.get("sprint", False),
                })
            except ValueError:
                logger.warning(f"Could not parse date {date_str!r} for {circuit.get('name')}")
    except FileNotFoundError:
        logger.warning(f"circuits.json not found at {CIRCUITS_JSON}")
    except json.JSONDecodeError:
        logger.exception("Could not parse circuits.json")
    return sessions


def _is_session_live_now(sessions: list[dict]) -> bool:
    """True if any race session started in the last 4 hours."""
    now = datetime.now(timezone.utc)
    for s in sessions:
        race_dt = s["race_date_utc"]
        delta = (now - race_dt).total_seconds() / 3600
        if 0 <= delta <= 4:
            return True
    return False


def start_scheduler(loop: asyncio.AbstractEventLoop, queue: asyncio.Queue) -> None:
    """
    Entry point — called from main.py lifespan on startup.
    Schedules SignalR start/stop jobs and, if a session is currently live,
    starts the client immediately.
    """
    global _scheduler, _loop_ref, _queue_ref
    _loop_ref = loop
    _queue_ref = queue

    sessions = _load_sessions()
    logger.info(f"Scheduler: loaded {len(sessions)} rounds from circuits.json")

    _scheduler = BackgroundScheduler(timezone="UTC")

    now = datetime.now(timezone.utc)
    scheduled = 0

    for s in sessions:
        race_dt = s["race_date_utc"]
        # Schedule start 5 min before the approximate race time
        start_dt = race_dt - timedelta(minutes=5)
        stop_dt  = race_dt + timedelta(hours=3)

        if start_dt > now:
            _scheduler.add_job(
                _start_signalr,
                trigger=DateTrigger(run_date=start_dt),
                id=f"start_r{s['round']}",
                misfire_grace_time=300,
            )
            _scheduler.add_job(
                _stop_and_clear,
                trigger=DateTrigger(run_date=stop_dt),
                id=f"stop_r{s['round']}",
                misfire_grace_time=300,
            )
            scheduled += 1

    _scheduler.start()
    logger.info(f"Scheduler started — {scheduled} future sessions scheduled")

    # If we're currently in a live window, start immediately
    if _is_session_live_now(sessions):
        logger.info("Scheduler: live session detected on startup — starting SignalR now")
        _start_signalr()
    else:
        logger.info("Scheduler: no live session — SignalR client idle (will auto-start)")


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
