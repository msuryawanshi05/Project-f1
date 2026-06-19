"""
scheduler.py — PITWALL session scheduler.

Reads EXACT session times from the Jolpica calendar (fetched from the
frontend store's calendar data or direct API call) and schedules SignalR
client to start 5 minutes before each individual session (FP1, FP2, FP3,
Qualifying, Sprint, Race).

Called from main.py lifespan on startup.
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import httpx

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.date import DateTrigger

from db import cache_clear
from signalr_client import get_client

logger = logging.getLogger(__name__)

CIRCUITS_JSON = Path(__file__).parent.parent / "frontend" / "src" / "data" / "circuits.json"

_scheduler: BackgroundScheduler | None = None
_loop_ref: asyncio.AbstractEventLoop | None = None
_queue_ref: asyncio.Queue | None = None
_client_running = False

# How many minutes before session to start SignalR client
START_LEAD_MINUTES = 10
# How many hours after session start before stopping (max F1 session + delay)
STOP_AFTER_HOURS   = 3


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


# ── Jolpica session extraction ─────────────────────────────────────────────────

async def _fetch_jolpica_calendar(year: int) -> list[dict]:
    """Fetch full calendar with exact session times from Jolpica API."""
    url = f"https://api.jolpi.ca/ergast/f1/{year}.json"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            return data.get("MRData", {}).get("RaceTable", {}).get("Races", [])
    except Exception as exc:
        logger.warning("Could not fetch Jolpica calendar: %s", exc)
        return []


def _extract_sessions_from_race(race: dict) -> list[dict]:
    """
    Given a Jolpica Race object, return list of {label, dt} for each session
    that has an exact date + time provided.
    """
    sessions = []
    # FP1
    if race.get("FirstPractice", {}).get("date"):
        fp = race["FirstPractice"]
        sessions.append(("FP1", fp["date"], fp.get("time", "11:00:00Z")))
    # FP2
    if race.get("SecondPractice", {}).get("date"):
        fp = race["SecondPractice"]
        sessions.append(("FP2", fp["date"], fp.get("time", "15:00:00Z")))
    # FP3
    if race.get("ThirdPractice", {}).get("date"):
        fp = race["ThirdPractice"]
        sessions.append(("FP3", fp["date"], fp.get("time", "12:00:00Z")))
    # Sprint
    if race.get("Sprint", {}).get("date"):
        sp = race["Sprint"]
        sessions.append(("Sprint", sp["date"], sp.get("time", "12:00:00Z")))
    # Qualifying
    if race.get("Qualifying", {}).get("date"):
        q = race["Qualifying"]
        sessions.append(("Qualifying", q["date"], q.get("time", "14:00:00Z")))
    # Race
    if race.get("date"):
        sessions.append(("Race", race["date"], race.get("time", "13:00:00Z")))

    result = []
    for label, date_str, time_str in sessions:
        try:
            dt_str = f"{date_str}T{time_str}"
            # Jolpica times end in 'Z' already
            if not dt_str.endswith("Z") and "+" not in time_str:
                dt_str += "Z"
            dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
            result.append({"label": label, "dt": dt, "race": race.get("raceName", "")})
        except ValueError as e:
            logger.warning("Could not parse session time %s %s: %s", date_str, time_str, e)
    return result


def _is_any_session_live_now(sessions: list[dict]) -> bool:
    """True if we're within 10 min before or 3 hours after any session start."""
    now = datetime.now(timezone.utc)
    for s in sessions:
        delta_minutes = (now - s["dt"]).total_seconds() / 60
        if -START_LEAD_MINUTES <= delta_minutes <= STOP_AFTER_HOURS * 60:
            return True
    return False


def _schedule_sessions(sessions: list[dict]) -> int:
    """Schedule start/stop jobs for all future sessions. Returns count scheduled."""
    now = datetime.now(timezone.utc)
    scheduled = 0
    seen_starts: set = set()

    for s in sessions:
        start_dt = s["dt"] - timedelta(minutes=START_LEAD_MINUTES)
        stop_dt  = s["dt"] + timedelta(hours=STOP_AFTER_HOURS)

        if start_dt > now:
            job_id = f"start_{s['race']}_{s['label']}"
            if job_id not in seen_starts:
                _scheduler.add_job(
                    _start_signalr,
                    trigger=DateTrigger(run_date=start_dt),
                    id=job_id,
                    misfire_grace_time=600,
                    replace_existing=True,
                )
                _scheduler.add_job(
                    _stop_and_clear,
                    trigger=DateTrigger(run_date=stop_dt),
                    id=f"stop_{s['race']}_{s['label']}",
                    misfire_grace_time=600,
                    replace_existing=True,
                )
                seen_starts.add(job_id)
                scheduled += 1
                logger.info(
                    "Scheduled: %s %s — start at %s UTC",
                    s["race"], s["label"], start_dt.strftime("%Y-%m-%d %H:%M"),
                )
    return scheduled


async def _schedule_from_jolpica():
    """
    Async initialiser — fetches exact session times from Jolpica, then
    schedules all future sessions. Falls back to circuits.json if API fails.
    """
    global _scheduler

    year = datetime.now(timezone.utc).year
    races = await _fetch_jolpica_calendar(year)

    all_sessions: list[dict] = []
    for race in races:
        all_sessions.extend(_extract_sessions_from_race(race))

    if not all_sessions:
        logger.warning("Jolpica returned no sessions — falling back to circuits.json approximation")
        all_sessions = _load_sessions_from_circuits_json()

    logger.info("Scheduler: loaded %d sessions from Jolpica", len(all_sessions))
    scheduled = _schedule_sessions(all_sessions)
    logger.info("Scheduler: %d future sessions scheduled", scheduled)

    # If we're currently in a live window, start immediately
    if _is_any_session_live_now(all_sessions):
        logger.info("Scheduler: live session detected on startup — starting SignalR now")
        _start_signalr()
    else:
        logger.info("Scheduler: no live session right now — SignalR idle (will auto-start before sessions)")


def _load_sessions_from_circuits_json() -> list[dict]:
    """Fallback: load approximate times from circuits.json (race day only)."""
    sessions = []
    try:
        with open(CIRCUITS_JSON, encoding="utf-8") as f:
            circuits = json.load(f)
        for circuit in circuits:
            date_str = circuit.get("race_date") or circuit.get("date")
            if not date_str:
                continue
            try:
                if "T" in date_str:
                    dt = datetime.fromisoformat(date_str).replace(tzinfo=timezone.utc)
                else:
                    dt = datetime.strptime(date_str, "%Y-%m-%d").replace(hour=12, tzinfo=timezone.utc)
                sessions.append({
                    "label": "Race (approx)",
                    "dt": dt,
                    "race": circuit.get("name", ""),
                })
            except ValueError:
                pass
    except (FileNotFoundError, json.JSONDecodeError):
        logger.warning("circuits.json fallback failed")
    return sessions


def start_scheduler(loop: asyncio.AbstractEventLoop, queue: asyncio.Queue) -> None:
    """
    Entry point — called from main.py lifespan on startup.
    Uses Jolpica API for exact session times so FP1/FP2/Qualifying all get
    their own start/stop jobs.
    """
    global _scheduler, _loop_ref, _queue_ref
    _loop_ref = loop
    _queue_ref = queue

    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.start()

    # Schedule async initialisation in the event loop
    asyncio.run_coroutine_threadsafe(_schedule_from_jolpica(), loop)
    logger.info("Scheduler started — awaiting Jolpica calendar fetch")


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
