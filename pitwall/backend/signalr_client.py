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
import copy
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

def parse_lap_time_to_seconds(lap_str: str) -> Optional[float]:
    """Convert '1:29.412' or '31.221' into float seconds."""
    if not lap_str:
        return None
    try:
        if ":" in lap_str:
            parts = lap_str.split(":")
            mins = int(parts[0])
            secs = float(parts[1])
            return mins * 60 + secs
        else:
            return float(lap_str)
    except Exception:
        return None


def clean_timing(raw: dict) -> dict:
    """TimingData → {drivers: [...]}"""
    lines = raw.get("Lines", {})
    drivers = []
    items = lines.items() if isinstance(lines, dict) else enumerate(lines) if isinstance(lines, list) else []
    for key, d in items:
        if not isinstance(d, dict):
            continue
        num_str = str(d.get("RacingNumber") or key)
        try:
            sectors_raw = d.get("Sectors") or {}
            if isinstance(sectors_raw, list):
                s1 = sectors_raw[0] if len(sectors_raw) > 0 and isinstance(sectors_raw[0], dict) else {}
                s2 = sectors_raw[1] if len(sectors_raw) > 1 and isinstance(sectors_raw[1], dict) else {}
                s3 = sectors_raw[2] if len(sectors_raw) > 2 and isinstance(sectors_raw[2], dict) else {}
            elif isinstance(sectors_raw, dict):
                s1 = sectors_raw.get("0") if isinstance(sectors_raw.get("0"), dict) else {}
                s2 = sectors_raw.get("1") if isinstance(sectors_raw.get("1"), dict) else {}
                s3 = sectors_raw.get("2") if isinstance(sectors_raw.get("2"), dict) else {}
            else:
                s1, s2, s3 = {}, {}, {}

            def _seg_status(seg: dict) -> str:
                if not isinstance(seg, dict):
                    return ""
                val = seg.get("Value", "")
                clr = int(seg.get("Colour", 0)) if seg.get("Colour") else 0
                return _SEGMENT_COLOUR.get(clr, "yellow") if val else ""

            last_lap_dict = d.get("LastLapTime") if isinstance(d.get("LastLapTime"), dict) else {}
            last_lap_val = last_lap_dict.get("Value", "") if last_lap_dict else (str(d.get("LastLapTime") or "") if not isinstance(d.get("LastLapTime"), (dict, list)) else "")
            s1_val = s1.get("Value", "") if isinstance(s1, dict) else ""
            s2_val = s2.get("Value", "") if isinstance(s2, dict) else ""
            s3_val = s3.get("Value", "") if isinstance(s3, dict) else ""
            
            last_lap_sec = parse_lap_time_to_seconds(last_lap_val)
            s1_sec = parse_lap_time_to_seconds(s1_val)
            s2_sec = parse_lap_time_to_seconds(s2_val)
            s3_sec = parse_lap_time_to_seconds(s3_val)
            
            is_personal_fastest = bool(last_lap_dict.get("PersonalFastest", False))
            is_overall_fastest = bool(last_lap_dict.get("OverallFastest", False))

            pos_val = d.get("Position", d.get("position", d.get("Line", 0)))
            try:
                pos_int = int(pos_val) if pos_val else 0
            except (ValueError, TypeError):
                pos_int = 0

            gap_ahead = d.get("IntervalToPositionAhead", {})
            gap_ahead_val = gap_ahead.get("Value", "") if isinstance(gap_ahead, dict) else (str(gap_ahead or "") if not isinstance(gap_ahead, list) else "")

            gap_leader = d.get("GapToLeader", {})
            gap_leader_val = gap_leader.get("Value", "") if isinstance(gap_leader, dict) else (str(gap_leader or "") if not isinstance(gap_leader, list) else "")

            lap_val = d.get("NumberOfLaps") or d.get("Laps") or d.get("lap")

            drivers.append({
                "number":        int(num_str),
                "code":          d.get("RacingNumber", num_str),
                "position":      pos_int,
                "gap_to_leader": gap_leader_val,
                "gap_to_ahead":  gap_ahead_val,
                "last_lap":      last_lap_val,
                "lap":           lap_val,
                "sector_1":      {"time": s1_val, "status": _seg_status(s1)},
                "sector_2":      {"time": s2_val, "status": _seg_status(s2)},
                "sector_3":      {"time": s3_val, "status": _seg_status(s3)},
                "in_pit":        bool(d.get("InPit", False)),
                "pit_out":       bool(d.get("PitOut", False)),
                "stopped":       bool(d.get("Stopped", False)),
                "knockout":      bool(d.get("KnockedOut", False)),
                "deleted_lap":   bool(d.get("DeletedLap", False)),
                # Frontend compatible fields
                "last_lap_time_in_s": last_lap_sec,
                "s1_time_in_s":       s1_sec,
                "s2_time_in_s":       s2_sec,
                "s3_time_in_s":       s3_sec,
                "s1_colour":          _seg_status(s1),
                "s2_colour":          _seg_status(s2),
                "s3_colour":          _seg_status(s3),
                "pitting":            bool(d.get("InPit", False)),
                "last_lap_deleted":   bool(d.get("DeletedLap", False)),
                "personal_fastest":   is_personal_fastest,
                "overall_fastest":    is_overall_fastest,
            })
        except Exception:
            logger.exception("clean_timing failed for driver %s", num_str)
    return {"drivers": drivers}


def clean_tyres(raw: dict) -> dict:
    """TimingAppData → {drivers: [...]}"""
    lines = raw.get("Lines", {})
    drivers = []
    items = lines.items() if isinstance(lines, dict) else enumerate(lines) if isinstance(lines, list) else []
    for key, d in items:
        if not isinstance(d, dict):
            continue
        num_str = str(d.get("RacingNumber") or key)
        try:
            stint_raw = d.get("Stints", {})
            stint_list = []


            # Stints can arrive as dict {"0": {...}} or list [{...}]
            if isinstance(stint_raw, dict):
                stint_items = [(int(k), v) for k, v in stint_raw.items() if isinstance(v, dict)]
            elif isinstance(stint_raw, list):
                stint_items = [(i, v) for i, v in enumerate(stint_raw) if isinstance(v, dict)]
            else:
                stint_items = []

            # Map all stints with their index
            for idx, s in stint_items:
                stint_list.append({
                    "stint_index":  idx,
                    "compound":     s.get("Compound", "UNKNOWN").upper(),
                    "laps":         int(s.get("TotalLaps", 0)),
                    "new_tyre":     bool(s.get("New", True)),
                })

            # Sort stints by index
            stint_list.sort(key=lambda x: x["stint_index"])

            if stint_list:
                s_last = stint_list[-1]
                comp = s_last.get("compound", "UNKNOWN")
                age = s_last.get("laps", 0)
                stint_num = s_last.get("stint_index", 0) + 1
                new_t = s_last.get("new_tyre", True)
            else:
                comp = "UNKNOWN"
                age = 0
                stint_num = 1
                new_t = True

            drivers.append({
                "number":       int(num_str),
                "compound":     comp,
                "tyre_age":     age,
                "age":          age,
                "laps":         age,
                "stint_number": stint_num,
                "new_tyre":     new_t,
                "stints":       stint_list,
            })
        except Exception:
            logger.exception("clean_tyres failed for driver %s", num_str)
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
                    "n_gear":   int(chan.get("4", 0)),
                    "throttle": int(chan.get("5", 0)),
                    "brake":    int(chan.get("6", 0)),   # binary: 0 or 100
                    "drs":      _DRS_MAP.get(drs_raw, "off"),
                })
            except Exception:
                logger.exception("clean_car_data failed for driver %s", num_str)
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
        "wind_speed":    round(_f("WindSpeed") * 3.6, 1),   # F1 sends m/s → convert to km/h
        "wind_direction": int(_f("WindDirection")),
        "rainfall":      raw.get("Rainfall", "0") not in (0, "0", False, "False"),
        "pressure":      _f("Pressure"),
    }


def clean_session(raw: dict) -> dict:
    """SessionInfo / SessionData → session envelope"""
    # SessionInfo shape
    name = raw.get("Name", raw.get("Type", "Unknown"))
    
    status_series = raw.get("StatusSeries", {})
    status = ""
    if isinstance(status_series, dict) and status_series:
        try:
            last_key = max(status_series.keys(), key=lambda k: int(k))
            status = status_series[last_key].get("SessionStatus", "")
        except (ValueError, TypeError):
            pass
    elif isinstance(status_series, list) and status_series:
        status = status_series[-1].get("SessionStatus", "") if isinstance(status_series[-1], dict) else ""
    
    if not status:
        status = raw.get("Status", "")

    clock = raw.get("Clock", raw.get("SystemTime", ""))

    # Derive phase
    status_lower = str(status).lower()
    if "finished" in status_lower or "ends" in status_lower:
        phase = "FINISHED"
    elif any(k in status_lower for k in ["started", "green", "active", "formation", "running", "racing"]):
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
    items = raw.items() if isinstance(raw, dict) else enumerate(raw) if isinstance(raw, list) else []
    for key, d in items:
        if not isinstance(d, dict):
            continue
        try:
            num_str = str(d.get("RacingNumber") or d.get("racingNumber") or key)
            tla = d.get("Tla", d.get("tla", num_str))
            first_name = d.get("FirstName", d.get("firstName", ""))
            last_name = d.get("LastName", d.get("lastName", ""))
            team = d.get("TeamName", d.get("teamName", ""))
            colour = d.get("TeamColour", d.get("teamColour", ""))
            
            if colour and not colour.startswith("#"):
                colour = "#" + colour
                
            drivers.append({
                "number":    int(num_str),
                "code":      tla,
                "full_name": f"{first_name} {last_name}".strip(),
                "team":      team,
                "team_colour": colour,
            })
        except Exception:
            logger.exception("clean_driver_list failed for driver %s", str(key))
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
        logger.exception("Cleaner failed for topic %r", topic)
        return None


def deep_merge(target: dict, source: dict) -> None:
    """Recursively merge source dict into target dict using deep copies for new dicts."""
    for k, v in source.items():
        if isinstance(v, dict):
            if k in target and isinstance(target[k], dict):
                deep_merge(target[k], v)
            else:
                target[k] = copy.deepcopy(v)
        else:
            target[k] = v


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
        self._clear_raw_states()

    def _clear_raw_states(self) -> None:
        self._raw_states = {
            "TimingData": {},
            "TimingAppData": {},
            "DriverList": {},
            "WeatherData": {},
            "SessionState": {},
            "TrackStatus": {},
            "LapCount": {},
            "RaceControlMessages": {"Messages": []},
        }

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
        self._clear_raw_states()
        logger.info("SignalR client stopped")

    def _put_message(self, envelope: dict) -> None:
        """Thread-safe: schedule a put into the asyncio queue."""
        if self._loop and self._queue:
            self._loop.call_soon_threadsafe(self._queue.put_nowait, envelope)

    def _process_message(self, topic: str, data_raw: dict) -> None:
        """Merge raw message deltas into self._raw_states and put cleaned message into the queue."""
        if topic in ("SessionInfo", "SessionData"):
            target_topic = "SessionState"
        else:
            target_topic = topic

        if target_topic in self._raw_states:
            if target_topic == "RaceControlMessages":
                new_msgs = data_raw.get("Messages", [])
                if isinstance(new_msgs, dict):
                    new_msgs = list(new_msgs.values())
                elif not isinstance(new_msgs, list):
                    new_msgs = [new_msgs] if new_msgs else []
                
                # Deduplicate and append
                existing_utcs = {m.get("Utc") for m in self._raw_states["RaceControlMessages"]["Messages"] if isinstance(m, dict) and m.get("Utc")}
                for msg in new_msgs:
                    if isinstance(msg, dict):
                        if msg.get("Utc") not in existing_utcs:
                            self._raw_states["RaceControlMessages"]["Messages"].append(msg)
                
                # Limit size to last 100 messages
                self._raw_states["RaceControlMessages"]["Messages"] = self._raw_states["RaceControlMessages"]["Messages"][-100:]

                # Check if race control announced formation lap / session start
                rc_formation = False
                for m in self._raw_states["RaceControlMessages"]["Messages"][-15:]:
                    txt = (m.get("Message", "") if isinstance(m, dict) else "").upper()
                    if any(k in txt for k in ["FORMATION LAP", "BEHIND SAFETY CAR", "START PROCEDURE", "RACE START"]):
                        rc_formation = True
                        break

                if rc_formation and "SessionState" in self._raw_states:
                    sess_data = self._raw_states["SessionState"]
                    cur_status = sess_data.get("Status", "")
                    if str(cur_status).lower() not in ["started", "active", "green"]:
                        sess_data["Status"] = "FormationLap"
                        if not sess_data.get("Name") or sess_data.get("Name") == "Unknown":
                            sess_data["Name"] = "FORMATION LAP"
                        sess_env = _route_message("SessionInfo", sess_data)
                        if sess_env:
                            self._put_message(sess_env)
            else:
                deep_merge(self._raw_states[target_topic], data_raw)
            
            clean_topic = "SessionInfo" if target_topic == "SessionState" else target_topic
            envelope = _route_message(clean_topic, self._raw_states[target_topic])
            if envelope:
                self._put_message(envelope)
        else:
            # Topic not stateful (e.g. CarData.z) - clean and broadcast immediately
            envelope = _route_message(topic, data_raw)
            if envelope:
                self._put_message(envelope)

    def _handle_feed(self, msg) -> None:
        """Called by signalrcore for every feed message (on 'feed' hub method)."""
        if isinstance(msg, CompletionMessage):
            # Initial state snapshot — dict {topic: data} or list of [topic, data, ''] tuples
            logger.info("Received CompletionMessage initial state snapshot")
            try:
                if isinstance(msg.result, dict):
                    for topic, data_raw in msg.result.items():
                        if isinstance(data_raw, str):
                            data_raw = (data_raw
                                        .replace("'", '"')
                                        .replace("True", "true")
                                        .replace("False", "false"))
                            try:
                                data_raw = json.loads(data_raw)
                            except json.JSONDecodeError:
                                continue
                        self._process_message(topic, data_raw)
                elif isinstance(msg.result, list):
                    for item in msg.result:
                        if isinstance(item, list) and len(item) >= 2:
                            topic, data_raw = item[0], item[1]
                            if isinstance(data_raw, str):
                                data_raw = (data_raw
                                            .replace("'", '"')
                                            .replace("True", "true")
                                            .replace("False", "false"))
                                try:
                                    data_raw = json.loads(data_raw)
                                except json.JSONDecodeError:
                                    continue
                            self._process_message(topic, data_raw)
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
                logger.debug("JSON decode error for topic %s", topic)
                return

        self._process_message(topic, data_raw)

    def _on_connect(self) -> None:
        self._connected = True
        logger.info("SignalR connected to F1 live timing")

    def _on_close(self) -> None:
        self._connected = False
        logger.warning("SignalR connection closed")

    def _run(self) -> None:
        """Blocking: negotiate, connect, subscribe, supervise. Retries on failure."""
        RETRY_DELAY = 10  # seconds between attempts

        while self._running:
            logger.info("SignalR connection starting...")
            self._attempt_connect()
            if not self._running:
                break
            logger.warning(
                "SignalR disconnected or failed to connect — retrying in %ds",
                RETRY_DELAY,
            )
            time.sleep(RETRY_DELAY)

    def _attempt_connect(self) -> bool:
        """Single connection attempt. Returns True if session ran successfully."""
        try:
            # Pre-negotiate to get AWSALBCORS cookie (required by F1's AWS WAF)
            logger.info("Pre-negotiating AWSALBCORS cookie...")
            resp = requests.options(_NEGOTIATE_URL, timeout=10)
            cookie = resp.cookies.get("AWSALBCORS", "")
            headers = {"Cookie": f"AWSALBCORS={cookie}"} if cookie else {}
            logger.info("Cookie obtained: %s", 'yes' if cookie else 'no (may still work)')

            options = {
                "verify_ssl": True,
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
            logger.info("Subscribing to %d topics...", len(TOPICS))
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
