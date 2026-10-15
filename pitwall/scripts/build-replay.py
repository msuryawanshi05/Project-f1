#!/usr/bin/env python
"""
build-replay.py — turn one real Grand Prix weekend into a replayable event stream.

    python scripts/build-replay.py --year 2026 --round 10 --telemetry-hz 2

Run this LOCALLY, with FastF1. The output is committed to the repo and the
deployed backend reads it directly: serving a replay makes zero outbound API
calls. That is the point. F1's live timing refuses connections from datacenter
IP ranges (403, confirmed in Phase D), so on the public deployment replay is the
only way the tower, strategy, telemetry and radio tabs can show anything at all.

── What it emits ───────────────────────────────────────────────────────────────
The payloads here are the SAME dicts the SignalR cleaners produce in
backend/signalr_client.py. The replay broadcaster wraps them in the same
envelope and pushes them down the same WebSocket into the same store. If the
replay rendered through its own path, the two would drift and replay would stop
being evidence that the live path works.

── Two budgets, two treatments ─────────────────────────────────────────────────
Lap-granularity data (timing, stints, pit stops, race control, weather) is tiny:
twenty cars × sixty laps is a few thousand small records, and it ships whole.

Car telemetry is not. At source it is a sample every ~240 ms per car per
channel; a 90-minute race across twenty cars is tens of millions of numbers. So
it is downsampled, stored as positional arrays rather than objects (no repeated
keys), and split one file per driver so the Telemetry tab fetches only the two
or three drivers a viewer actually selects.

Everything is written gzipped. The backend serves the bytes as-is with
Content-Encoding: gzip, so nothing decompresses on the server.
"""

from __future__ import annotations

import argparse
import gzip
import json
import math
import shutil
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

# Windows consoles default to cp1252, which cannot encode the characters used
# in this script's progress output. Without this the build dies on a print(),
# having already done all the work.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass


import fastf1  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

HERE = Path(__file__).resolve().parent
DEFAULT_OUT = HERE.parent / "backend" / "replay"
CACHE = HERE.parent / "backend" / "ff1_cache"

# FastF1's session identifiers, and the Jolpica schedule keys the frontend's
# weekend state machine uses for the same sessions. Keeping both means a replay
# session can be matched to the schedule without a second lookup table.
SESSIONS = [
    ("FP1", "FirstPractice", "FP1", "practice"),
    ("FP2", "SecondPractice", "FP2", "practice"),
    ("FP3", "ThirdPractice", "FP3", "practice"),
    ("Q", "Qualifying", "QUALIFYING", "qualifying"),
    ("R", "Race", "RACE", "race"),
]

# Telemetry channels, in the order they are stored in each sample row.
TELEMETRY_CHANNELS = ["speed", "rpm", "gear", "throttle", "brake", "drs"]

# F1's DRS channel values, mapped the way signalr_client maps them. In 2026 the
# channel reflects Manual Override Mode rather than a rear wing, so the names
# stay neutral.
DRS_OPEN = {10, 12, 14}


# ── helpers ───────────────────────────────────────────────────────────────────

def fmt_laptime(td) -> str | None:
    """A Timedelta as F1 writes it: '1:29.412', or '31.221' under a minute."""
    if td is None or pd.isna(td):
        return None
    total = td.total_seconds()
    if total <= 0:
        return None
    minutes, seconds = divmod(total, 60)
    if minutes >= 1:
        return f"{int(minutes)}:{seconds:06.3f}"
    return f"{seconds:.3f}"


def secs(td) -> float | None:
    if td is None or pd.isna(td):
        return None
    return round(float(td.total_seconds()), 3)


def rel(td, origin: float) -> float | None:
    """A feed-axis Timedelta as seconds from the green light."""
    v = secs(td)
    return None if v is None else round(v - origin, 3)


def num(v, nd=1):
    """A JSON-safe number: NaN and numpy scalars both become plain values."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return round(f, nd)


def intish(v):
    f = num(v, 0)
    return None if f is None else int(f)


def write_gz(path: Path, obj) -> int:
    """Write compact gzipped JSON. Returns the compressed size in bytes."""
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(obj, separators=(",", ":"), allow_nan=False).encode("utf-8")
    with gzip.open(path, "wb", compresslevel=9) as fh:
        fh.write(raw)
    return path.stat().st_size


def human(n: int) -> str:
    for unit in ("B", "KB", "MB"):
        if n < 1024 or unit == "MB":
            return f"{n:.1f} {unit}" if unit != "B" else f"{n} B"
        n /= 1024
    return f"{n:.1f} MB"


def session_origin(session) -> tuple[float, str | None]:
    """
    (feed_offset_seconds, absolute_utc_of_t0).

    FastF1 timestamps laps, track status, weather and car data as a Timedelta
    from the start of the TIMING FEED, which starts well before the session
    does — at Monza qualifying the feed is already 13 minutes old when the
    light goes green. Race control messages, meanwhile, carry an absolute
    datetime. A playhead has to be one clock, so everything here is converted
    to seconds from the green light.
    """
    offset = 0.0
    sst = getattr(session, "session_start_time", None)
    if sst is not None and not pd.isna(sst):
        offset = float(pd.Timedelta(sst).total_seconds())

    t0 = getattr(session, "t0_date", None)
    absolute = None
    if t0 is not None and not pd.isna(t0):
        absolute = _as_utc(pd.Timestamp(t0) + pd.Timedelta(seconds=offset))
    elif getattr(session, "date", None) is not None:
        absolute = _as_utc(pd.Timestamp(session.date))
    return offset, absolute


def _as_utc(ts) -> str:
    """
    An ISO string that says it is UTC.

    FastF1's timestamps are naive UTC. Written out naive they reach the browser
    as, for example, "2026-09-05T15:04:02" — which JavaScript parses as LOCAL
    time, silently shifting every replayed instant by the viewer's offset. That
    clock drives the weekend state machine, so the shift puts the page on the
    wrong session.
    """
    ts = pd.Timestamp(ts)
    ts = ts.tz_localize("UTC") if ts.tzinfo is None else ts.tz_convert("UTC")
    return ts.isoformat()


# ── timing stream ─────────────────────────────────────────────────────────────

# Cars that survive each qualifying segment in 2026. Used for the tower's cut
# lines; the frontend reads it from the timing payload exactly as it does live.
QUALI_NO_ENTRIES = [22, 15, 10]


def quali_segments(session, origin: float) -> list[tuple[float, int]]:
    """
    (t, part) for each of Q1/Q2/Q3, from the session status feed.

    FastF1 records a Started/Finished pair per segment, so the n-th Started is
    the start of Qn. Inferring the segment from elapsed time would break the
    moment a session is red-flagged, which is exactly when it matters.
    """
    status = getattr(session, "session_status", None)
    if status is None or status.empty:
        return []
    out = []
    part = 0
    for row in status.itertuples():
        if str(row.Status) != "Started":
            continue
        part += 1
        out.append((round(float(pd.Timedelta(row.Time).total_seconds()) - origin, 2), part))
    return out


def part_at(segments: list[tuple[float, int]], t: float) -> int | None:
    """Which qualifying segment is running at time t."""
    current = None
    for start, part in segments:
        if t >= start:
            current = part
    return current


def build_timing_events(session, drivers_meta, origin: float, kind: str) -> tuple[list, dict]:
    """
    One timing event per completed lap, at the moment that lap ended.

    Events carry only what changed, which is how the real TimingData feed
    behaves — it sends deltas and the backend merges them into a full state
    before cleaning. The replay broadcaster does the same, so the frontend
    receives the identical full snapshots either way.

    Races and qualifying need different maths, and conflating them is how the
    first version of this produced a Monza grid that disagreed with the result
    sheet:

      Race        position comes from the feed; the gap to the leader is the
                  difference in session time at the same lap number.
      Qualifying  there is no position on track — FastF1 leaves the column
                  empty for every row — and the order is the ranking of best
                  laps IN THE CURRENT SEGMENT. A faster lap from Q2 does not
                  count towards the Q3 order. Knocked-out cars hold the
                  positions they were eliminated in.
    """
    laps = session.laps
    if laps is None or laps.empty:
        return [], {}

    laps = laps.sort_values("Time")
    is_race = kind == "race"
    segments = [] if is_race else quali_segments(session, origin)

    # Session time at which each driver completed each lap, so a race gap can be
    # read straight off: {lap_number: {driver_number: seconds}}
    lap_times: dict[int, dict[str, float]] = {}
    for row in laps.itertuples():
        t = rel(row.Time, origin)
        ln = intish(row.LapNumber)
        if t is None or ln is None:
            continue
        lap_times.setdefault(ln, {})[str(row.DriverNumber)] = t

    # The furthest segment each car reached. Known up front because this runs
    # offline against a finished session, which is what lets a knocked-out car
    # hold a sensible position instead of vanishing from the order.
    final_part: dict[str, int] = {}
    if not is_race:
        for row in laps.itertuples():
            t = rel(row.Time, origin)
            if t is None or pd.isna(row.LapTime):
                continue
            part = part_at(segments, t)
            dn = str(row.DriverNumber)
            if part and part > final_part.get(dn, 0):
                final_part[dn] = part

    # Progressive bests, so sector colours mean what they mean live: green is a
    # personal best, purple is the fastest anyone has gone in the session.
    best_lap: dict[str, float] = {}
    best_lap_str: dict[str, str] = {}
    best_lap_num: dict[str, int] = {}
    best_sector: dict[str, list] = {}
    session_best_sector: list = [None, None, None]
    session_best_lap: float | None = None
    pit_count: dict[str, int] = {}
    speeds_seen: dict[str, dict] = {}
    seg_best: dict[int, dict[str, float]] = {}
    last_position: dict[str, int] = {}

    events = []
    stats = {"laps": 0, "drivers": set()}

    def quali_order(part: int) -> list[tuple[str, int, bool]]:
        """(driver, position, knocked_out) for the whole field at this moment."""
        in_part = sorted(seg_best.get(part, {}).items(), key=lambda kv: kv[1])
        order = [(dn, i + 1, False) for i, (dn, _) in enumerate(in_part)]
        # Below them, each earlier segment's casualties in the order they were
        # knocked out in.
        slot = len(order) + 1
        for earlier in range(part - 1, 0, -1):
            out = [dn for dn, fp in final_part.items() if fp == earlier]
            for dn in sorted(out, key=lambda d: seg_best.get(earlier, {}).get(d, 1e9)):
                order.append((dn, slot, True))
                slot += 1
        return order

    for row in laps.itertuples():
        t = rel(row.Time, origin)
        if t is None:
            continue
        dn = str(row.DriverNumber)
        ln = intish(row.LapNumber)
        stats["laps"] += 1
        stats["drivers"].add(dn)

        lap_secs = secs(row.LapTime)
        lap_str = fmt_laptime(row.LapTime)
        deleted = bool(getattr(row, "Deleted", False))

        sector_payload = []
        bs = best_sector.setdefault(dn, [None, None, None])
        for i, col in enumerate(("Sector1Time", "Sector2Time", "Sector3Time")):
            st = secs(getattr(row, col))
            if st is None:
                sector_payload.append({"time": None, "status": None})
                continue
            status = "yellow"
            if bs[i] is None or st < bs[i]:
                bs[i] = st
                status = "green"
            if session_best_sector[i] is None or st < session_best_sector[i]:
                session_best_sector[i] = st
                status = "purple"
            sector_payload.append({"time": f"{st:.3f}", "status": status})

        personal_fastest = False
        overall_fastest = False
        # A deleted lap counts for nothing: not the driver's best, not the
        # session's, and not the qualifying order.
        if lap_secs is not None and not deleted:
            if dn not in best_lap or lap_secs < best_lap[dn]:
                best_lap[dn] = lap_secs
                best_lap_str[dn] = lap_str
                best_lap_num[dn] = ln
                personal_fastest = True
            if session_best_lap is None or lap_secs < session_best_lap:
                session_best_lap = lap_secs
                overall_fastest = True

        in_pit = not pd.isna(row.PitInTime)
        pit_out = not pd.isna(row.PitOutTime)
        if in_pit:
            pit_count[dn] = pit_count.get(dn, 0) + 1

        # Speed trap readings persist until replaced, as they do on the live
        # timing screen between laps.
        sp = speeds_seen.setdefault(dn, {})
        for key, col in (("speed_i1", "SpeedI1"), ("speed_i2", "SpeedI2"),
                         ("speed_fl", "SpeedFL"), ("speed_trap", "SpeedST")):
            v = intish(getattr(row, col, None))
            if v:
                sp[key] = v

        gap_leader, gap_ahead = "", ""
        position = intish(row.Position)
        part = None
        knocked_out = False
        movers: list[dict] = []

        if is_race:
            at_lap = lap_times.get(ln, {})
            if at_lap:
                leader_t = min(at_lap.values())
                if t > leader_t:
                    gap_leader = f"+{t - leader_t:.3f}"
                ahead = [v for v in at_lap.values() if v < t]
                if ahead:
                    gap_ahead = f"+{t - max(ahead):.3f}"
        else:
            part = part_at(segments, t) or 1
            if lap_secs is not None and not deleted:
                sb = seg_best.setdefault(part, {})
                if dn not in sb or lap_secs < sb[dn]:
                    sb[dn] = lap_secs

            order = quali_order(part)
            sb = seg_best.get(part, {})
            leader_time = min(sb.values()) if sb else None
            for odn, opos, oko in order:
                if odn == dn:
                    position = opos
                    knocked_out = oko
                    if not oko and leader_time is not None and dn in sb:
                        if opos > 1:
                            gap_leader = f"+{sb[dn] - leader_time:.3f}"
                            ahead_times = sorted(v for v in sb.values() if v < sb[dn])
                            if ahead_times:
                                gap_ahead = f"+{sb[dn] - ahead_times[-1]:.3f}"
                elif last_position.get(odn) != opos:
                    # One car improving pushes everyone it passed down a place.
                    # Those cars have not set a lap, so they get a position-only
                    # delta — which is exactly the shape the live feed sends.
                    movers.append({"number": int(odn), "position": opos,
                                   "knockout": oko})
                last_position[odn] = opos
            last_position[dn] = position

        meta = drivers_meta.get(dn, {})
        payload = {
            "number": int(dn),
            "racing_number": int(dn),
            "position": position,
            "driver": meta.get("code"),
            "gap_to_leader": gap_leader,
            "gap_to_ahead": gap_ahead,
            "quali_gap_to_leader": None if is_race else gap_leader,
            "quali_gap_to_ahead": None if is_race else gap_ahead,
            "last_lap": lap_str,
            "lap": ln,
            "sector_1": sector_payload[0],
            "sector_2": sector_payload[1],
            "sector_3": sector_payload[2],
            "in_pit": in_pit,
            "pit_out": pit_out,
            "stopped": False,
            "retired": False,
            "knockout": knocked_out,
            "cutoff": False,
            "deleted_lap": deleted,
            "last_lap_time_in_s": lap_secs,
            "s1_time_in_s": secs(row.Sector1Time),
            "s2_time_in_s": secs(row.Sector2Time),
            "s3_time_in_s": secs(row.Sector3Time),
            "s1_colour": sector_payload[0]["status"],
            "s2_colour": sector_payload[1]["status"],
            "s3_colour": sector_payload[2]["status"],
            "best_lap": best_lap_str.get(dn),
            "best_lap_time_in_s": best_lap.get(dn),
            "best_lap_number": best_lap_num.get(dn),
            "pit_count": pit_count.get(dn, 0),
            "pitting": in_pit,
            "personal_fastest": personal_fastest,
            "overall_fastest": overall_fastest,
            **sp,
        }

        data = {"drivers": [payload] + movers}
        if not is_race:
            # SessionPart and NoEntries ride on the TimingData root in the live
            # feed, and the frontend already reads them from there to place the
            # Q1/Q2/Q3 cut lines.
            data["session_part"] = part
            data["no_entries"] = QUALI_NO_ENTRIES

        events.append({"t": round(t, 2), "type": "timing", "data": data})

    stats["drivers"] = len(stats["drivers"])
    return events, stats


def build_tyre_events(session, drivers_meta, origin: float) -> list:
    """
    A stint event whenever a driver's compound or tyre age changes.

    Emitted per lap rather than per stint: tyre age is on screen the whole time
    and only moves one lap at a time, so a per-stint event would leave the
    age frozen at its starting value for the length of a stint.
    """
    laps = session.laps
    if laps is None or laps.empty:
        return []

    events = []
    stints: dict[str, list] = {}

    for row in laps.sort_values("Time").itertuples():
        t = rel(row.Time, origin)
        dn = str(row.DriverNumber)
        compound = str(row.Compound) if not pd.isna(row.Compound) else "UNKNOWN"
        stint_idx = intish(row.Stint) or 0
        age = intish(row.TyreLife) or 0
        fresh = bool(row.FreshTyre) if not pd.isna(row.FreshTyre) else True
        if t is None:
            continue

        d_stints = stints.setdefault(dn, [])
        found = next((s for s in d_stints if s["stint_index"] == stint_idx), None)
        if found is None:
            found = {"stint_index": stint_idx, "compound": compound.upper(),
                     "laps": age, "new_tyre": fresh}
            d_stints.append(found)
        else:
            found["laps"] = age

        events.append({
            "t": round(t, 2),
            "type": "tyres",
            "data": {"drivers": [{
                "number": int(dn),
                "driver_number": int(dn),
                "compound": compound.upper(),
                "age": age,
                "stint_number": stint_idx,
                "new_tyre": fresh,
                "stints": [dict(s) for s in d_stints],
            }]},
        })

    return events


def build_track_status_events(session, origin: float) -> list:
    """Green / yellow / SC / red / VSC, at the moment each change was flagged."""
    ts = session.track_status
    if ts is None or ts.empty:
        return []
    events = []
    last = None
    for row in ts.itertuples():
        t = rel(row.Time, origin)
        status = str(row.Status)
        if t is None or status == last:
            continue
        last = status
        events.append({
            "t": round(max(t, 0), 2),
            "type": "track_status",
            "data": {"status": status, "message": str(row.Message)},
        })
    return events


def build_race_control_events(session, origin: float, t0_abs: str | None) -> list:
    rcm = session.race_control_messages
    if rcm is None or rcm.empty:
        return []
    # These timestamps are absolute, not feed-relative, so they are converted
    # against the known wall-clock instant of t=0 rather than the feed offset.
    base = pd.Timestamp(t0_abs) if t0_abs else None
    events = []
    for row in rcm.itertuples():
        if base is None:
            continue
        # row.Time is FastF1's naive UTC; base now carries a zone, and pandas
        # refuses to subtract one from the other.
        stamp = pd.Timestamp(row.Time)
        stamp = stamp.tz_localize("UTC") if stamp.tzinfo is None else stamp.tz_convert("UTC")
        t = float((stamp - base).total_seconds())
        events.append({
            "t": round(max(t, 0), 2),
            "type": "race_control",
            "data": {"messages": [{
                # The real UTC stamp is kept: the frontend's race-control
                # freshness window compares it against the clock, and in replay
                # that clock is the virtual one.
                "time": _as_utc(row.Time),
                "lap": intish(getattr(row, "Lap", None)),
                "category": str(getattr(row, "Category", "") or ""),
                "flag": str(getattr(row, "Flag", "") or ""),
                "scope": str(getattr(row, "Scope", "") or ""),
                "driver_number": (str(row.RacingNumber)
                                  if not pd.isna(getattr(row, "RacingNumber", None)) else None),
                "message": str(row.Message),
            }]},
        })
    return events


def build_weather_events(session, origin: float, every_s: int = 60) -> list:
    """Weather at one sample a minute. It moves slowly; per-second is waste."""
    wd = session.weather_data
    if wd is None or wd.empty:
        return []
    events = []
    next_t = 0.0
    for row in wd.itertuples():
        t = rel(row.Time, origin)
        if t is None or t < next_t:
            continue
        next_t = t + every_s
        events.append({
            "t": round(max(t, 0), 2),
            "type": "weather",
            "data": {
                "air_temp": num(row.AirTemp),
                "track_temp": num(row.TrackTemp),
                "humidity": num(row.Humidity),
                "wind_speed": num(row.WindSpeed),
                "wind_direction": intish(row.WindDirection) or 0,
                "rainfall": bool(row.Rainfall),
                "pressure": num(row.Pressure),
            },
        })
    return events


def build_lap_count_events(session, origin: float) -> list:
    """Leader lap number, which is what the tower's LAP x / y counts."""
    laps = session.laps
    if laps is None or laps.empty:
        return []
    total = intish(session.total_laps) if getattr(session, "total_laps", None) else None
    events = []
    seen = 0
    for row in laps.sort_values("Time").itertuples():
        ln = intish(row.LapNumber)
        t = rel(row.Time, origin)
        if ln is None or t is None or ln <= seen:
            continue
        seen = ln
        events.append({"t": round(t, 2), "type": "lap_count",
                       "data": {"total": total, "current": ln}})
    return events


# ── telemetry ─────────────────────────────────────────────────────────────────

def build_telemetry(session, hz: float, origin: float) -> tuple[dict, dict]:
    """
    Per-driver car telemetry, downsampled onto a fixed grid.

    Stored as positional rows — [t, speed, rpm, gear, throttle, brake, drs] —
    because at thousands of samples per driver the JSON keys outweigh the
    numbers they label.

    Returns (per_driver_payloads, per_driver_sample_counts).
    """
    step = 1.0 / hz
    out, counts = {}, {}

    for dn in session.drivers:
        try:
            car = session.car_data[dn]
        except (KeyError, AttributeError):
            continue
        if car is None or car.empty:
            continue

        t = car["Time"].dt.total_seconds().to_numpy() - origin
        if t.size == 0:
            continue

        # One row per grid slot, taking the sample nearest each slot. Nearest
        # rather than mean: a mean would invent brake values between 0 and 100
        # that the car never had, and smear gear changes across two gears.
        grid = np.arange(0.0, float(t[-1]) + step, step)
        idx = np.searchsorted(t, grid).clip(0, t.size - 1)

        speed = car["Speed"].to_numpy()[idx]
        rpm = car["RPM"].to_numpy()[idx]
        gear = car["nGear"].to_numpy()[idx]
        throttle = car["Throttle"].to_numpy()[idx]
        brake = car["Brake"].to_numpy()[idx]
        drs = car["DRS"].to_numpy()[idx]

        rows = [
            [round(float(gt), 1), int(sp), int(rp), int(g), int(th),
             100 if bool(br) else 0, 1 if int(dr) in DRS_OPEN else 0]
            for gt, sp, rp, g, th, br, dr in
            zip(grid, speed, rpm, gear, throttle, brake, drs)
        ]
        out[str(dn)] = {
            "driver_number": int(dn),
            "hz": hz,
            "channels": ["t"] + TELEMETRY_CHANNELS,
            "samples": rows,
        }
        counts[str(dn)] = len(rows)

    return out, counts


def _lap_elapsed(tel, grid, dist, lap_time):
    """Elapsed seconds along the lap, scaled so the final value is the lap time."""
    raw = tel["Time"].dt.total_seconds().to_numpy()
    raw = raw - raw[0]
    sampled = np.interp(grid, dist, raw)
    span = float(sampled[-1])
    if lap_time and span > 0:
        sampled = sampled * (lap_time / span)
    return [round(float(v), 3) for v in sampled]


def build_fastest_laps(session, points: int = 400) -> dict:
    """
    Each driver's fastest lap, resampled onto a common DISTANCE axis.

    Separate from the time-series telemetry above, and tiny, because a
    two-driver lap comparison is only meaningful against distance: compared
    against time the slower car's trace drifts further behind at every corner
    and the two stop describing the same piece of track.
    """
    laps = session.laps
    if laps is None or laps.empty:
        return {}

    out = {}
    for dn in session.drivers:
        try:
            lap = laps.pick_drivers(dn).pick_fastest()
            if lap is None or (hasattr(lap, "empty") and lap.empty):
                continue
            tel = lap.get_car_data().add_distance()
        except Exception:  # noqa: BLE001
            continue
        if tel is None or tel.empty:
            continue

        dist = tel["Distance"].to_numpy()
        if dist.size < 2 or not np.isfinite(dist[-1]) or dist[-1] <= 0:
            continue
        grid = np.linspace(0.0, float(dist[-1]), points)

        def samp(col):
            return np.interp(grid, dist, tel[col].to_numpy().astype(float))

        out[str(dn)] = {
            "driver_number": int(dn),
            "lap_number": intish(lap["LapNumber"]),
            "lap_time": fmt_laptime(lap["LapTime"]),
            "lap_time_s": secs(lap["LapTime"]),
            "distance": [round(float(d), 1) for d in grid],
            "speed": [int(v) for v in samp("Speed")],
            "throttle": [int(v) for v in samp("Throttle")],
            "brake": [100 if v > 50 else 0 for v in samp("Brake")],
            "gear": [int(round(v)) for v in samp("nGear")],
            # Elapsed time along the lap, which is what a delta trace is the
            # difference of.
            #
            # Normalised so the last value IS the lap time. The telemetry
            # samples do not start and end exactly on the timing line — they
            # are a ~4 Hz stream clipped to the lap — so the raw elapsed time
            # runs short by up to a percent. Unnormalised, a delta trace between
            # two drivers ended at +0.441s when the two laps were 0.060s apart,
            # which makes the one number on the chart a viewer can check wrong.
            "time": _lap_elapsed(tel, grid, dist, secs(lap["LapTime"])),
        }
    return out


# ── event markers ─────────────────────────────────────────────────────────────

def build_markers(events: list, kind: str) -> list:
    """
    The points worth putting on a scrub bar, and worth jumping between.

    A scrub bar with no marks on it tells a viewer nothing about where the
    interesting parts of a two-hour race are.
    """
    markers = []
    for ev in events:
        t, typ, data = ev["t"], ev["type"], ev["data"]
        if typ == "track_status":
            status = data["status"]
            if status == "4":
                markers.append({"t": t, "kind": "sc", "label": "Safety car"})
            elif status == "6":
                markers.append({"t": t, "kind": "vsc", "label": "Virtual safety car"})
            elif status == "5":
                markers.append({"t": t, "kind": "red", "label": "Red flag"})
        elif typ == "timing" and kind == "race":
            # A pit entry in qualifying is a car going back to the garage, not
            # a strategy call. Marking all 104 of them would bury the two or
            # three moments on the bar that are worth jumping to.
            d = data["drivers"][0]
            if d.get("in_pit"):
                markers.append({"t": t, "kind": "pit",
                                "label": f"{d.get('driver') or d['number']} pits"})
        elif typ == "race_control":
            m = data["messages"][0]
            if (m.get("flag") or "").upper() in ("RED", "CHEQUERED"):
                markers.append({"t": t, "kind": "flag", "label": m["message"][:60]})

    # Lead changes: a new car in P1 is the other thing worth jumping to.
    leader = None
    for ev in events:
        if ev["type"] != "timing" or kind != "race":
            continue
        d = ev["data"]["drivers"][0]
        if d.get("position") == 1 and d["number"] != leader:
            if leader is not None:
                markers.append({"t": ev["t"], "kind": "lead",
                                "label": f"{d.get('driver') or d['number']} leads"})
            leader = d["number"]

    markers.sort(key=lambda m: m["t"])
    return markers


# ── per-session build ─────────────────────────────────────────────────────────

def build_session(year, rnd, ff1_code, label, kind, out_dir, hz, report):
    print(f"\n── {label} ───────────────────────────────────────────", flush=True)
    session = fastf1.get_session(year, rnd, ff1_code)
    session.load(laps=True, telemetry=True, weather=True, messages=True)

    drivers_meta = {}
    for dn in session.drivers:
        try:
            info = session.get_driver(dn)
        except Exception:  # noqa: BLE001
            continue
        colour = str(info.get("TeamColor", "") or "")
        drivers_meta[str(dn)] = {
            "number": int(dn),
            "code": str(info.get("Abbreviation", dn)),
            "full_name": str(info.get("FullName", "")),
            "team": str(info.get("TeamName", "")),
            "team_colour": f"#{colour}" if colour and not colour.startswith("#") else colour,
        }

    origin, date_start = session_origin(session)

    timing_events, tstats = build_timing_events(session, drivers_meta, origin, kind)
    events = (
        timing_events
        + build_tyre_events(session, drivers_meta, origin)
        + build_track_status_events(session, origin)
        + build_race_control_events(session, origin, date_start)
        + build_weather_events(session, origin)
        + (build_lap_count_events(session, origin) if kind == "race" else [])
    )
    # Anything stamped before the green light is part of the starting state:
    # the opening track status, the formation-lap messages, the first weather
    # reading. Clamped to zero rather than dropped, so a viewer who presses
    # play sees the session already set up.
    for ev in events:
        if ev["t"] < 0:
            ev["t"] = 0.0
    events.sort(key=lambda e: (e["t"], e["type"] != "track_status"))

    duration = max((e["t"] for e in events), default=0.0)

    stream = {
        "label": label,
        "kind": kind,
        "duration_s": round(duration, 1),
        # The real wall-clock instant t=0 corresponds to. The frontend adds the
        # playhead to this to get a virtual "now", which is what drives the
        # Phase E weekend state machine during a replay.
        "date_start_utc": date_start,
        "total_laps": intish(getattr(session, "total_laps", None)),
        "drivers": list(drivers_meta.values()),
        "markers": build_markers(events, kind),
        "events": events,
    }

    sdir = out_dir / label.lower()
    size_stream = write_gz(sdir / "stream.json.gz", stream)

    telemetry, counts = build_telemetry(session, hz, origin)
    tel_total = 0
    for dn, payload in telemetry.items():
        tel_total += write_gz(sdir / "telemetry" / f"{dn}.json.gz", payload)

    fastest = build_fastest_laps(session)
    size_fastest = write_gz(sdir / "fastest-laps.json.gz", fastest) if fastest else 0

    per_driver = int(tel_total / max(len(telemetry), 1))
    report.append({
        "session": label,
        "events": len(events),
        "timing_events": len(timing_events),
        "markers": len(stream["markers"]),
        "duration_s": round(duration, 1),
        "stream_bytes": size_stream,
        "telemetry_bytes": tel_total,
        "telemetry_drivers": len(telemetry),
        "telemetry_per_driver_bytes": per_driver,
        "fastest_bytes": size_fastest,
        "samples_per_driver": int(sum(counts.values()) / max(len(counts), 1)) if counts else 0,
    })

    print(f"   events {len(events):>6}  stream {human(size_stream):>9}"
          f"  telemetry {human(tel_total):>9} ({len(telemetry)} drivers,"
          f" {human(per_driver)}/driver)  fastest-laps {human(size_fastest)}", flush=True)

    return {
        "label": label,
        "kind": kind,
        "duration_s": round(duration, 1),
        "date_start_utc": date_start,
        "total_laps": stream["total_laps"],
        "markers": len(stream["markers"]),
        "telemetry_drivers": sorted(int(d) for d in telemetry),
        "has_fastest_laps": bool(fastest),
        "bytes": {"stream": size_stream, "telemetry": tel_total, "fastest": size_fastest},
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--year", type=int, default=2026)
    ap.add_argument("--round", type=int, required=True)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--telemetry-hz", type=float, default=2.0,
                    help="Telemetry sample rate. Source is ~4 Hz; see the README "
                         "in the output for the size/fidelity table.")
    ap.add_argument("--sessions", default="FP1,FP2,FP3,Q,R",
                    help="Comma-separated FastF1 session codes to build.")
    ap.add_argument("--clean", action="store_true",
                    help="Delete the weekend's output directory first.")
    args = ap.parse_args()

    CACHE.mkdir(parents=True, exist_ok=True)
    fastf1.Cache.enable_cache(str(CACHE))

    event = fastf1.get_event(args.year, args.round)
    slug = f"{args.year}-{args.round:02d}-" + (
        str(event["EventName"]).lower()
        .replace(" grand prix", "").replace(" ", "-").replace("ã", "a").replace("é", "e")
    )
    out_dir = args.out / slug
    if args.clean and out_dir.exists():
        shutil.rmtree(out_dir)

    wanted = [s.strip() for s in args.sessions.split(",") if s.strip()]
    report: list[dict] = []
    built = []
    for ff1_code, jolpica_key, label, kind in SESSIONS:
        if ff1_code not in wanted:
            continue
        try:
            info = build_session(args.year, args.round, ff1_code, label, kind,
                                 out_dir, args.telemetry_hz, report)
            info["key"] = jolpica_key
            built.append(info)
        except Exception as exc:  # noqa: BLE001
            print(f"   !! {label} failed: {type(exc).__name__}: {exc}", flush=True)

    manifest = {
        "slug": slug,
        "year": args.year,
        "round": args.round,
        "name": str(event["EventName"]),
        "location": str(event["Location"]),
        "country": str(event["Country"]),
        "circuit": str(event.get("OfficialEventName", event["EventName"])),
        "event_date": str(event["EventDate"])[:10],
        "telemetry_hz": args.telemetry_hz,
        "sessions": built,
    }
    write_gz(out_dir / "manifest.json.gz", manifest)
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=1), encoding="utf-8")

    total = sum(p.stat().st_size for p in out_dir.rglob("*") if p.is_file())
    print("\n═══ sizes ═══════════════════════════════════════════════")
    for r in report:
        print(f"  {r['session']:<5} stream {human(r['stream_bytes']):>9}"
              f"  telemetry {human(r['telemetry_bytes']):>9}"
              f"  ({human(r['telemetry_per_driver_bytes'])}/driver,"
              f" {r['samples_per_driver']} samples)"
              f"  fastest {human(r['fastest_bytes']):>8}")
    print(f"\n  committed total: {human(total)}")
    race = next((r for r in report if r["session"] == "RACE"), None)
    if race:
        print(f"  race tower first load: {human(race['stream_bytes'])} "
              f"(telemetry is fetched per driver, on demand)")
    print(f"\n  → {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
