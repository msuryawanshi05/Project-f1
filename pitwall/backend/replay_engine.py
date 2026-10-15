"""
replay_engine.py — play a recorded Grand Prix weekend down the live WebSocket.

F1's timing feed answers 403 to datacenter IP ranges (confirmed in Phase D), so
the deployed site can never show live timing. Replay is not a consolation prize
for that; on a public URL it is the only way anyone who visits can see the tower,
strategy, telemetry or radio tabs do anything at all.

── One rendering path, not two ────────────────────────────────────────────────
The envelopes emitted here are byte-for-byte the shape signalr_client produces:
same `type`, same cleaned payloads, same socket, same store, same components.
A replay that rendered through its own path would drift from the live one, and
would stop being evidence that the live path works.

The one structural thing this has to reproduce is the MERGE. The live client
keeps a full server-side state per topic and deep-merges each delta into it
before cleaning, so every `timing` envelope on the wire carries the whole field.
The frontend store replaces its timing array outright, so a replay that sent
only the changed car would blank the other nineteen. Recorded events are
therefore deltas, and `_SessionState` folds them.

── Why state is per connection ────────────────────────────────────────────────
The live broadcaster fans one upstream feed out to every client, which is right:
there is one race and everyone is watching the same moment of it. Replay is the
opposite. Two people on a public URL must not fight over the scrubber, so each
connection gets its own playhead, speed and session, and the shared object here
is only the immutable recorded data.

── Why scrubbing re-folds rather than re-plays ────────────────────────────────
Seeking to lap 40 has to produce the state at lap 40 — tyre age, stint number,
pit count, gaps, lap count, the flags shown so far — not an empty tower that
fills in over the following laps. Folding every event up to the target and
emitting the result as one snapshot does that in a single pass, and it is the
same fold the forward playback uses, so the two cannot disagree.
"""

from __future__ import annotations

import asyncio
import copy
import gzip
import json
import logging
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Optional

logger = logging.getLogger("pitwall.replay")

REPLAY_DIR = Path(__file__).parent / "replay"

# How far ahead of the playhead to pull events in one go. Large enough that the
# loop is not woken for every single event at 10x, small enough that a seek or a
# pause takes effect immediately.
_TICK_S = 0.25

SPEEDS = (1, 2, 5, 10)


# ── Recorded data ─────────────────────────────────────────────────────────────

class ReplayLibrary:
    """
    The committed replay files, read once and shared read-only.

    A session's event stream is a few tens of kilobytes compressed and a couple
    of megabytes expanded, so holding the decoded form in memory is cheaper than
    re-reading and re-parsing it for every viewer. Nothing here is mutated after
    load; per-connection state lives in ReplaySession.
    """

    def __init__(self, root: Path = REPLAY_DIR):
        self.root = root
        self._manifests: dict[str, dict] = {}
        self._streams: dict[tuple[str, str], dict] = {}

    # -- discovery ---------------------------------------------------------

    def weekends(self) -> list[dict]:
        out = []
        if not self.root.is_dir():
            return out
        for d in sorted(self.root.iterdir()):
            man = self.manifest(d.name)
            if man:
                out.append({k: v for k, v in man.items() if k != "sessions"}
                           | {"sessions": [
                               {kk: vv for kk, vv in s.items()
                                if kk not in ("telemetry_drivers",)}
                               for s in man.get("sessions", [])]})
        return out

    def manifest(self, slug: str) -> Optional[dict]:
        if slug in self._manifests:
            return self._manifests[slug]
        path = self._safe(slug) / "manifest.json.gz"
        if not path.is_file():
            return None
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            man = json.load(fh)
        self._manifests[slug] = man
        return man

    def stream(self, slug: str, session: str) -> Optional[dict]:
        key = (slug, session.lower())
        if key in self._streams:
            return self._streams[key]
        path = self._safe(slug) / session.lower() / "stream.json.gz"
        if not path.is_file():
            return None
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            data = json.load(fh)
        self._streams[key] = data
        logger.info("Loaded replay stream %s/%s: %d events",
                    slug, session, len(data.get("events", [])))
        return data

    def asset(self, slug: str, *parts: str) -> Optional[Path]:
        """A committed file's path, for serving its gzip bytes directly."""
        path = self._safe(slug)
        for part in parts:
            path = path / part
        try:
            path = path.resolve()
            path.relative_to(self._safe(slug))
        except (ValueError, OSError):
            return None
        return path if path.is_file() else None

    def _safe(self, slug: str) -> Path:
        """Contain a slug to the replay directory — it arrives from a URL."""
        candidate = (self.root / slug).resolve()
        root = self.root.resolve()
        try:
            candidate.relative_to(root)
        except ValueError as exc:
            raise ValueError(f"replay slug escapes the replay directory: {slug!r}") from exc
        return candidate


# ── Folded session state ──────────────────────────────────────────────────────

class _SessionState:
    """
    Everything the recorded deltas add up to at a point in time.

    Mirrors the per-topic raw state signalr_client keeps, for the same reason:
    the wire format carries full snapshots, the recording carries deltas, and
    something has to hold the difference.
    """

    def __init__(self, stream: dict):
        self.stream = stream
        self.reset()

    def reset(self) -> None:
        self.timing: dict[int, dict] = {}
        self.tyres: dict[int, dict] = {}
        self.track_status: dict = {"status": "1", "message": "AllClear"}
        self.weather: dict = {}
        self.lap_count: dict = {}
        self.race_control: list[dict] = []
        self.session_part: Optional[int] = None
        self.no_entries: Optional[list] = None

    def apply(self, event: dict) -> None:
        typ, data = event["type"], event["data"]
        if typ == "timing":
            for d in data.get("drivers", []):
                self.timing.setdefault(d["number"], {}).update(d)
            if data.get("session_part") is not None:
                self.session_part = data["session_part"]
            if data.get("no_entries") is not None:
                self.no_entries = data["no_entries"]
        elif typ == "tyres":
            for d in data.get("drivers", []):
                self.tyres.setdefault(d["number"], {}).update(d)
        elif typ == "track_status":
            self.track_status = dict(data)
        elif typ == "weather":
            self.weather = dict(data)
        elif typ == "lap_count":
            self.lap_count = dict(data)
        elif typ == "race_control":
            # Newest first, capped — the same shape and bound the store keeps.
            for m in data.get("messages", []):
                self.race_control.insert(0, m)
            del self.race_control[50:]

    # -- wire format -------------------------------------------------------

    def timing_payload(self) -> dict:
        out: dict[str, Any] = {
            "drivers": sorted(copy.deepcopy(list(self.timing.values())),
                              key=lambda d: d.get("position") or 99),
        }
        if self.session_part is not None:
            out["session_part"] = self.session_part
        if self.no_entries is not None:
            out["no_entries"] = self.no_entries
        return out

    def tyres_payload(self) -> dict:
        return {"drivers": copy.deepcopy(list(self.tyres.values()))}

    def snapshot_envelopes(self, phase: str, clock: str) -> list[dict]:
        """The whole current state, as the envelopes a fresh client would get."""
        stream = self.stream
        out = [
            _env("driver_list", {"drivers": stream.get("drivers", [])}),
            _env("session", {
                "name": stream.get("label", "SESSION"),
                "status": "Started" if phase == "LIVE" else "Finished",
                "lap": self.lap_count.get("current"),
                "total_laps": stream.get("total_laps"),
                "clock": clock,
                "phase": phase,
                "qualifying_part": self.session_part,
            }),
            _env("track_status", self.track_status),
        ]
        if self.timing:
            out.append(_env("timing", self.timing_payload()))
        if self.tyres:
            out.append(_env("tyres", self.tyres_payload()))
        if self.weather:
            out.append(_env("weather", self.weather))
        if self.lap_count:
            out.append(_env("lap_count", self.lap_count))
        if self.race_control:
            # Oldest first so the store's prepend leaves them newest-first.
            out.append(_env("race_control",
                            {"messages": list(reversed(self.race_control))}))
        return out


def _env(msg_type: str, data: dict) -> dict:
    return {
        "type": msg_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": data,
    }


# ── One viewer's replay ───────────────────────────────────────────────────────

class ReplaySession:
    """
    A single connection's playhead over one recorded session.

    Owns its position, speed and play/pause state. Nothing here is shared, so
    two viewers can sit at lap 3 and lap 48 of the same race without either
    noticing the other.
    """

    def __init__(self, library: ReplayLibrary, send: Callable[[dict], Any]):
        self.library = library
        self._send = send
        self.slug: Optional[str] = None
        self.session_key: Optional[str] = None
        self.stream: Optional[dict] = None
        self.state: Optional[_SessionState] = None

        self.position = 0.0        # playhead, seconds from the green light
        self.speed = 1
        self.playing = False
        self.duration = 0.0
        self._cursor = 0           # index of the next event to emit
        self._task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

    # -- lifecycle ---------------------------------------------------------

    async def load(self, slug: str, session_key: str, at: float = 0.0) -> bool:
        stream = self.library.stream(slug, session_key)
        if stream is None:
            await self._send(_env("replay_error", {
                "message": f"No recorded data for {slug}/{session_key}."}))
            return False

        await self.stop()
        self.slug, self.session_key = slug, session_key
        self.stream = stream
        self.state = _SessionState(stream)
        self.duration = float(stream.get("duration_s") or 0.0)
        self.speed = 1
        self.playing = False
        await self.seek(at, announce=False)
        await self._announce()
        return True

    async def stop(self) -> None:
        self.playing = False
        task, self._task = self._task, None
        if task:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass

    async def exit(self) -> None:
        """Leave replay and tell the client the tab is live-mode again."""
        await self.stop()
        self.slug = self.session_key = self.stream = self.state = None
        self.position = 0.0
        self.duration = 0.0
        await self._send(_env("replay_state", {"active": False}))

    # -- transport ---------------------------------------------------------

    async def play(self) -> None:
        if not self.stream or self.playing:
            return
        self.playing = True
        self._task = asyncio.create_task(self._run())
        await self._announce()

    async def pause(self) -> None:
        if not self.stream:
            return
        await self.stop()
        await self._announce()

    async def set_speed(self, speed: int) -> None:
        self.speed = speed if speed in SPEEDS else 1
        await self._announce()

    async def seek(self, target: float, announce: bool = True) -> None:
        """
        Jump to `target` and send the state as it stood there.

        Re-folds from the beginning rather than stepping forward from wherever
        the playhead was. A backwards seek cannot be served any other way — pit
        counts and tyre ages only go up — and folding forwards would make the
        two directions behave differently for no gain: the whole stream is a few
        thousand events, and folding it takes a millisecond.
        """
        if not self.stream or self.state is None:
            return
        was_playing = self.playing
        await self.stop()

        target = max(0.0, min(float(target), self.duration))
        self.state.reset()
        events = self.stream["events"]
        i = 0
        while i < len(events) and events[i]["t"] <= target:
            self.state.apply(events[i])
            i += 1
        self._cursor = i
        self.position = target

        phase = "FINISHED" if target >= self.duration else "LIVE"
        for env in self.state.snapshot_envelopes(phase, self._clock()):
            await self._send(env)

        if was_playing:
            await self.play()
        elif announce:
            await self._announce()

    async def next_event(self) -> None:
        """Jump to the next marker — a pit stop, a safety car, a lead change."""
        if not self.stream:
            return
        markers = self.stream.get("markers", [])
        nxt = next((m for m in markers if m["t"] > self.position + 0.5), None)
        await self.seek(nxt["t"] - 2.0 if nxt else self.duration)

    # -- playback ----------------------------------------------------------

    async def _run(self) -> None:
        """
        Advance the playhead in wall-clock time and emit what it passes.

        Timing is taken from the monotonic clock each tick rather than
        accumulated, so a slow send or a scheduling hiccup does not make the
        replay drift further behind real time with every iteration.
        """
        events = self.stream["events"]
        last = time.monotonic()
        try:
            while self.playing:
                await asyncio.sleep(_TICK_S)
                now = time.monotonic()
                self.position += (now - last) * self.speed
                last = now

                if self.position >= self.duration:
                    self.position = self.duration
                    await self._drain(events, len(events))
                    self.playing = False
                    await self._send(_env("session", {
                        "name": self.stream.get("label", "SESSION"),
                        "status": "Finished",
                        "lap": self.state.lap_count.get("current"),
                        "total_laps": self.stream.get("total_laps"),
                        "clock": self._clock(),
                        "phase": "FINISHED",
                    }))
                    await self._announce()
                    return

                end = self._cursor
                while end < len(events) and events[end]["t"] <= self.position:
                    end += 1
                await self._drain(events, end)
                await self._announce(light=True)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Replay playback failed")
            self.playing = False

    async def _drain(self, events: list, end: int) -> None:
        """
        Fold everything up to `end`, then send one envelope per changed topic.

        Coalescing matters at 10x, where a tick can cover forty events: sending
        each one would mean forty full-field timing snapshots for one frame of
        animation, and the frontend would render the last of them regardless.
        """
        if end <= self._cursor:
            return
        touched: set[str] = set()
        pending_rc: list[dict] = []
        for ev in events[self._cursor:end]:
            self.state.apply(ev)
            touched.add(ev["type"])
            if ev["type"] == "race_control":
                pending_rc.extend(ev["data"].get("messages", []))
        self._cursor = end

        if "timing" in touched:
            await self._send(_env("timing", self.state.timing_payload()))
        if "tyres" in touched:
            await self._send(_env("tyres", self.state.tyres_payload()))
        if "track_status" in touched:
            await self._send(_env("track_status", self.state.track_status))
        if "weather" in touched:
            await self._send(_env("weather", self.state.weather))
        if "lap_count" in touched:
            await self._send(_env("lap_count", self.state.lap_count))
        if pending_rc:
            await self._send(_env("race_control", {"messages": pending_rc}))

    # -- status ------------------------------------------------------------

    def _clock(self) -> str:
        """Time remaining in the session, as the live feed's clock reads."""
        remaining = max(0.0, self.duration - self.position)
        h, rem = divmod(int(remaining), 3600)
        m, s = divmod(rem, 60)
        return f"{h:02d}:{m:02d}:{s:02d}"

    def virtual_now(self) -> Optional[str]:
        """
        The real instant the playhead sits at.

        This is what lets a replay drive the weekend state machine: the frontend
        feeds it in as `now`, and PRE_WEEKEND through POST_WEEKEND resolve from
        the recorded weekend rather than today's date. No lifecycle code knows
        replay exists.
        """
        if not self.stream:
            return None
        start = self.stream.get("date_start_utc")
        if not start:
            return None
        try:
            base = datetime.fromisoformat(start)
        except ValueError:
            return None
        # Always hand out a zone-qualified instant. JavaScript parses a
        # date-time with no offset as LOCAL time, so a naive string shifted the
        # replay's virtual clock by the viewer's own offset — which in turn fed
        # a wrong `now` to the weekend state machine and put the page on the
        # wrong session. Recorded times are UTC; say so.
        if base.tzinfo is None:
            base = base.replace(tzinfo=timezone.utc)
        return (base + timedelta(seconds=self.position)).isoformat()

    def status(self) -> dict:
        man = self.library.manifest(self.slug) if self.slug else None
        return {
            "active": bool(self.stream),
            "weekend": self.slug,
            "weekend_name": (man or {}).get("name"),
            "event_date": (man or {}).get("event_date"),
            "session": self.session_key,
            "session_label": (self.stream or {}).get("label"),
            "kind": (self.stream or {}).get("kind"),
            "position": round(self.position, 2),
            "duration": round(self.duration, 2),
            "speed": self.speed,
            "playing": self.playing,
            "virtual_now": self.virtual_now(),
            "total_laps": (self.stream or {}).get("total_laps"),
        }

    async def _announce(self, light: bool = False) -> None:
        payload = self.status()
        if light:
            # While playing, the position moves four times a second and nothing
            # else does. Sending the rest would be noise.
            payload = {k: payload[k] for k in
                       ("active", "position", "duration", "speed", "playing",
                        "virtual_now", "session", "weekend")}
        await self._send(_env("replay_state", payload))


# ── Command dispatch ──────────────────────────────────────────────────────────

async def handle_command(replay: ReplaySession, msg: dict) -> bool:
    """
    Apply one client command. Returns True if it was a replay command.

    Commands arrive over the SAME socket the live feed uses. A second endpoint
    would have been simpler to write and would have meant two ways into the
    store, which is the thing this phase is specifically trying not to build.
    """
    cmd = msg.get("cmd")
    if not isinstance(cmd, str) or not cmd.startswith("replay."):
        return False

    try:
        if cmd == "replay.load":
            await replay.load(str(msg.get("weekend", "")),
                              str(msg.get("session", "")),
                              float(msg.get("at") or 0.0))
        elif cmd == "replay.play":
            await replay.play()
        elif cmd == "replay.pause":
            await replay.pause()
        elif cmd == "replay.speed":
            await replay.set_speed(int(msg.get("speed", 1)))
        elif cmd == "replay.seek":
            await replay.seek(float(msg.get("at", 0.0)))
        elif cmd == "replay.next_event":
            await replay.next_event()
        elif cmd == "replay.exit":
            await replay.exit()
        elif cmd == "replay.status":
            await replay._announce()
    except (TypeError, ValueError) as exc:
        logger.warning("Bad replay command %r: %s", msg, exc)
    except Exception:
        logger.exception("Replay command %r failed", cmd)
    return True
