"""
signalr_client.py — PITWALL F1 SignalR live timing bridge.

Connects to F1's SignalR Core feed at livetiming.formula1.com,
subscribes to timing topics, cleans each message into a standardised
envelope, and puts it into an asyncio.Queue so main.py can broadcast
it to all connected WebSocket clients.

The signalrcore library is synchronous/threaded — we bridge to asyncio
via loop.call_soon_threadsafe to put items into the queue safely.
"""
import asyncio
import json
import logging
import threading
import time
from datetime import datetime, timezone
from typing import Optional

import requests
from signalrcore.hub_connection_builder import HubConnectionBuilder
from signalrcore.messages.completion_message import CompletionMessage

logger = logging.getLogger(__name__)

# ── F1 SignalR endpoints (from FastF1 source) ─────────────────────────────────
_CONNECTION_URL = "wss://livetiming.formula1.com/signalrcore"
_NEGOTIATE_URL  = "https://livetiming.formula1.com/signalrcore/negotiate"

# Topics to subscribe to
TOPICS = [
    "TimingData",           # positions, gaps, lap times, sector times
    "TimingAppData",        # tyre compounds, stint info
    "CarData.z",            # speed, throttle, brake, gear, rpm (compressed)
    "RaceControlMessages",  # safety car, flags, penalties
    "WeatherData",          # air/track temp, humidity, wind, rain
    "SessionInfo",          # session type and status
    "TrackStatus",          # green/yellow/SC/red/VSC
    "SessionData",          # clock, phase
    "LapCount",             # total laps / laps remaining
    "DriverList",           # driver info and team colours
]

# ── Colour / DRS maps ─────────────────────────────────────────────────────────
_SEGMENT_COLOUR = {
    2048: "purple",   # personal best sector
    2049: "green",    # faster than yellow
    2051: "yellow",   # slower
    2064: "white",    # pit out / safety car lap
}

_DRS_MAP = {
    8:  "off",
    10: "available",
    12: "on",
}

# ── Envelope factory ──────────────────────────────────────────────────────────

def _envelope(msg_type: str, data: dict) -> dict:
    return {
        "type": msg_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": data,
    }


# ── Cleaner functions — one per message type ─────────────────────────────────

def clean_timing(raw: dict) -> dict:
    """TimingData → {drivers: [...]}"""
    lines = raw.get("Lines", {})
    drivers = []
    for num_str, d in lines.items():
        try:
            s1 = d.get("Sectors", {}).get("0", {})
            s2 = d.get("Sectors", {}).get("1", {})
            s3 = d.get("Sectors", {}).get("2", {})
            gaps = d.get("IntervalToPositionAhead", {})

            def _seg_status(seg: dict) -> str:
                val = seg.get("Value", "")
                clr = int(seg.get("Colour", 0)) if seg.get("Colour") else 0
                return _SEGMENT_COLOUR.get(clr, "yellow") if val else ""

            drivers.append({
                "number":        int(num_str),
                "code":          d.get("RacingNumber", num_str),
                "position":      int(d.get("Line", 0)),
                "gap_to_leader": d.get("GapToLeader", ""),
                "gap_to_ahead":  gaps.get("Value", ""),
                "last_lap":      d.get("LastLapTime", {}).get("Value", ""),
                "sector_1":      {"time": s1.get("Value", ""), "status": _seg_status(s1)},
                "sector_2":      {"time": s2.get("Value", ""), "status": _seg_status(s2)},
                "sector_3":      {"time": s3.get("Value", ""), "status": _seg_status(s3)},
                "in_pit":        bool(d.get("InPit", False)),
                "pit_out":       bool(d.get("PitOut", False)),
                "stopped":       bool(d.get("Stopped", False)),
                "knockout":      bool(d.get("KnockedOut", False)),
                "deleted_lap":   bool(d.get("DeletedLap", False)),
            })
        except Exception:
            logger.exception(f"clean_timing failed for driver {num_str}")
    return {"drivers": drivers}


def clean_tyres(raw: dict) -> dict:
    """TimingAppData → {drivers: [...]}"""
    lines = raw.get("Lines", {})
    drivers = []
    for num_str, d in lines.items():
        try:
            stint = d.get("Stints", {})
            # stints is a dict keyed "0","1","2"… take the last one
            if stint:
                last_key = max(stint.keys(), key=lambda k: int(k))
                s = stint[last_key]
            else:
                s = {}
            drivers.append({
                "number":       int(num_str),
                "compound":     s.get("Compound", "UNKNOWN").upper(),
                "tyre_age":     int(s.get("TotalLaps", 0)),
                "stint_number": int(last_key) + 1 if stint else 1,
                "new_tyre":     bool(s.get("New", True)),
            })
        except Exception:
            logger.exception(f"clean_tyres failed for driver {num_str}")
    return {"drivers": drivers}


def clean_car_data(raw: dict) -> dict:
    """CarData.z → {entries: [{driver_number, speed, throttle, brake, gear, rpm, drs}]}
    CarData is compressed — raw already decompressed by signalrcore into a list of entries.
    """
    entries = []
    for entry in raw.get("Entries", []):
        cars = entry.get("Cars", {})
        for num_str, ch in cars.items():
            chan = ch.get("Channels", {})
            try:
                drs_raw = int(chan.get("45", 0))
                entries.append({
                    "driver_number": int(num_str),
                    "speed":    int(chan.get("2", 0)),
                    "rpm":      int(chan.get("3", 0)),
                    "gear":     int(chan.get("4", 0)),
                    "throttle": int(chan.get("5", 0)),
                    "brake":    int(chan.get("6", 0)),   # binary: 0 or 100
                    "drs":      _DRS_MAP.get(drs_raw, "off"),
                })
            except Exception:
                logger.exception(f"clean_car_data failed for driver {num_str}")
    return {"entries": entries}


def clean_race_control(raw: dict) -> dict:
    """RaceControlMessages → {messages: [...]}"""
    messages = []
    for msg in raw.get("Messages", {}).values() if isinstance(raw.get("Messages"), dict) \
            else raw.get("Messages", []):
        try:
            messages.append({
                "time":          msg.get("Utc", ""),
                "lap":           msg.get("Lap"),
                "category":      msg.get("Category", ""),
                "flag":          msg.get("Flag", ""),
                "scope":         msg.get("Scope", ""),
                "driver_number": msg.get("RacingNumber"),
                "message":       msg.get("Message", ""),
            })
        except Exception:
            logger.exception("clean_race_control message error")
    return {"messages": messages}


def clean_weather(raw: dict) -> dict:
    """WeatherData → flat weather dict"""
    def _f(key, default=0.0):
        try:
            return float(raw.get(key, default))
        except (ValueError, TypeError):
            return default

    return {
        "air_temp":      _f("AirTemp"),
        "track_temp":    _f("TrackTemp"),
        "humidity":      _f("Humidity"),
        "wind_speed":    _f("WindSpeed"),
        "wind_direction": int(_f("WindDirection")),
        "rainfall":      raw.get("Rainfall", "0") not in (0, "0", False, "False"),
        "pressure":      _f("Pressure"),
    }


def clean_session(raw: dict) -> dict:
    """SessionInfo / SessionData → session envelope"""
    # SessionInfo shape
    name   = raw.get("Name", raw.get("Type", "Unknown"))
    status = raw.get("Status", raw.get("StatusSeries", [{}])[-1].get("SessionStatus", ""))
    clock  = raw.get("Clock", raw.get("SystemTime", ""))

    # Derive phase
    status_lower = str(status).lower()
    if "finished" in status_lower or "ends" in status_lower:
        phase = "FINISHED"
    elif "started" in status_lower or "green" in status_lower:
        phase = "LIVE"
    else:
        phase = "PRE"

    return {
        "name":       name,
        "status":     status,
        "lap":        raw.get("CurrentLap"),
        "total_laps": raw.get("TotalLaps"),
        "clock":      clock,
        "phase":      phase,
    }


def clean_track_status(raw: dict) -> dict:
    """TrackStatus → {status, message}"""
    return {
        "status":  str(raw.get("Status", "1")),
        "message": raw.get("Message", "AllClear"),
    }


def clean_driver_list(raw: dict) -> dict:
    """DriverList → {drivers: [...]}"""
    drivers = []
    for num_str, d in raw.items():
        if not isinstance(d, dict):
            continue
        try:
            colour = d.get("TeamColour", "")
            if colour and not colour.startswith("#"):
                colour = "#" + colour
            drivers.append({
                "number":    int(num_str),
                "code":      d.get("Tla", num_str),
                "full_name": f"{d.get('FirstName', '')} {d.get('LastName', '')}".strip(),
                "team":      d.get("TeamName", ""),
                "team_colour": colour,
            })
        except Exception:
            logger.exception(f"clean_driver_list failed for driver {num_str}")
    return {"drivers": drivers}


# ── Topic router ──────────────────────────────────────────────────────────────

_TOPIC_CLEANERS = {
    "TimingData":         ("timing",        clean_timing),
    "TimingAppData":      ("tyres",         clean_tyres),
    "CarData.z":          ("car_data",      clean_car_data),
    "RaceControlMessages":("race_control",  clean_race_control),
    "WeatherData":        ("weather",       clean_weather),
    "SessionInfo":        ("session",       clean_session),
    "SessionData":        ("session",       clean_session),
    "TrackStatus":        ("track_status",  clean_track_status),
    "DriverList":         ("driver_list",   clean_driver_list),
    "LapCount":           ("lap_count",     lambda r: {"total": r.get("TotalLaps"), "current": r.get("CurrentLap")}),
}

def _route_message(topic: str, data: dict) -> Optional[dict]:
    """Return a cleaned envelope dict, or None if topic is unknown or data is empty."""
    if not data or topic not in _TOPIC_CLEANERS:
        return None
    msg_type, cleaner = _TOPIC_CLEANERS[topic]
    try:
        cleaned = cleaner(data)
        return _envelope(msg_type, cleaned)
    except Exception:
        logger.exception(f"Cleaner failed for topic {topic!r}")
        return None


# ── Main client class ─────────────────────────────────────────────────────────

class PitwallSignalRClient:
    """
    Connects to F1 live timing via SignalR Core (no auth),
    cleans messages, and puts them into an asyncio.Queue.

    Run with .start(loop, queue) — starts a daemon thread.
    Stop with .stop().
    """

    def __init__(self):
        self._connection = None
        self._thread: Optional[threading.Thread] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._queue: Optional[asyncio.Queue] = None
        self._running = False
        self._connected = False

    def start(self, loop: asyncio.AbstractEventLoop, queue: asyncio.Queue) -> None:
        """Start the SignalR client in a background daemon thread."""
        if self._running:
            logger.warning("SignalR client already running")
            return
        self._loop = loop
        self._queue = queue
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True, name="signalr-thread")
        self._thread.start()
        logger.info("SignalR client thread started")

    def stop(self) -> None:
        """Gracefully stop the client."""
        self._running = False
        if self._connection:
            try:
                self._connection.stop()
            except Exception:
                pass
        logger.info("SignalR client stopped")

    def _put_message(self, envelope: dict) -> None:
        """Thread-safe: schedule a put into the asyncio queue."""
        if self._loop and self._queue:
            self._loop.call_soon_threadsafe(self._queue.put_nowait, envelope)

    def _handle_feed(self, msg) -> None:
        """Called by signalrcore for every feed message (on 'feed' hub method)."""
        if isinstance(msg, CompletionMessage):
            # Initial state snapshot — a list of [topic, data, ''] tuples
            try:
                for item in msg.result:
                    if isinstance(item, list) and len(item) >= 2:
                        topic, data_raw = item[0], item[1]
                        if isinstance(data_raw, str):
                            try:
                                data_raw = json.loads(data_raw)
                            except json.JSONDecodeError:
                                continue
                        envelope = _route_message(topic, data_raw)
                        if envelope:
                            self._put_message(envelope)
            except Exception:
                logger.exception("Failed processing CompletionMessage")
            return

        if not isinstance(msg, list) or len(msg) < 2:
            return

        topic = msg[0]
        data_raw = msg[1]

        if isinstance(data_raw, str):
            # fix F1's non-compliant JSON booleans
            data_raw = (data_raw
                        .replace("'", '"')
                        .replace("True", "true")
                        .replace("False", "false"))
            try:
                data_raw = json.loads(data_raw)
            except json.JSONDecodeError:
                logger.debug(f"JSON decode error for topic {topic}")
                return

        envelope = _route_message(topic, data_raw)
        if envelope:
            self._put_message(envelope)

    def _on_connect(self) -> None:
        self._connected = True
        logger.info("SignalR connected to F1 live timing")

    def _on_close(self) -> None:
        self._connected = False
        logger.warning("SignalR connection closed")

    def _run(self) -> None:
        """Blocking: negotiate, connect, subscribe, supervise. Retries on failure."""
        MAX_RETRIES  = 5
        RETRY_DELAY  = 10  # seconds between attempts

        for attempt in range(1, MAX_RETRIES + 1):
            if not self._running:
                break
            logger.info(f"SignalR connection attempt {attempt}/{MAX_RETRIES}")
            success = self._attempt_connect()
            if success:
                return
            if attempt < MAX_RETRIES:
                logger.warning(
                    f"SignalR attempt {attempt} failed — retrying in {RETRY_DELAY}s"
                )
                time.sleep(RETRY_DELAY)

        logger.error("SignalR: max retries reached — giving up")

    def _attempt_connect(self) -> bool:
        """Single connection attempt. Returns True if session ran successfully."""
        try:
            # Pre-negotiate to get AWSALBCORS cookie (required by F1's AWS WAF)
            logger.info("Pre-negotiating AWSALBCORS cookie...")
            resp = requests.options(_NEGOTIATE_URL, timeout=10)
            cookie = resp.cookies.get("AWSALBCORS", "")
            headers = {"Cookie": f"AWSALBCORS={cookie}"} if cookie else {}
            logger.info(f"Cookie obtained: {'yes' if cookie else 'no (may still work)'}")

            options = {
                "verify_ssl": True,
                "access_token_factory": None,   # no_auth mode
                "headers": headers,
            }

            self._connection = (
                HubConnectionBuilder()
                .with_url(_CONNECTION_URL, options=options)
                .configure_logging(logging.WARNING)
                .build()
            )

            self._connection.on_open(self._on_connect)
            self._connection.on_close(self._on_close)
            self._connection.on("feed", self._handle_feed)

            self._connection.start()

            # Wait for connection
            deadline = time.time() + 15
            while not self._connected and time.time() < deadline:
                time.sleep(0.1)

            if not self._connected:
                logger.error("SignalR connection timeout — check network or F1 season status")
                return False

            # Subscribe to all topics
            logger.info(f"Subscribing to {len(TOPICS)} topics...")
            self._connection.send("Subscribe", [TOPICS], on_invocation=self._handle_feed)

            # Supervise — stay alive while session runs
            while self._running and self._connected:
                time.sleep(1)

            return True

        except Exception:
            logger.exception("SignalR connection attempt error")
            return False
        finally:
            try:
                if self._connection:
                    self._connection.stop()
            except Exception:
                pass
            logger.info("SignalR attempt cleanup done")


# ── Module-level singleton ────────────────────────────────────────────────────
_client: Optional[PitwallSignalRClient] = None


def get_client() -> PitwallSignalRClient:
    global _client
    if _client is None:
        _client = PitwallSignalRClient()
    return _client
