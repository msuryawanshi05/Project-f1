"""
test_replay_engine.py — python -m pytest test_replay_engine.py, or run directly.

The replay engine has three jobs that are easy to get quietly wrong:

  1. Emit the SAME envelopes the live path emits. If they diverge, replay stops
     being evidence that the live path works, which is the whole reason it
     drives the live socket rather than its own.
  2. Reconstruct state at an arbitrary point. Seeking to lap 40 has to produce
     lap 40's tyre ages, pit counts and gaps, not an empty tower that fills in
     over the following laps.
  3. Keep playheads per connection. On a public URL two viewers must not share
     one scrubber.

Each is checked against the real committed Monza data rather than a fixture, so
a change to the build script that breaks the contract fails here too.
"""

import asyncio
import json
from pathlib import Path

import pytest

from replay_engine import ReplayLibrary, ReplaySession, handle_command

SLUG = "2026-13-italian"


def _library():
    lib = ReplayLibrary(Path(__file__).parent / "replay")
    if not lib.manifest(SLUG):
        pytest.skip("replay data not built; run scripts/build-replay.py")
    return lib


class Recorder:
    """Stands in for a WebSocket, keeping what was sent."""

    def __init__(self):
        self.sent: list[dict] = []

    async def __call__(self, env):
        # Envelopes go over the wire as JSON, so anything unserialisable is a
        # bug here, not at runtime.
        self.sent.append(json.loads(json.dumps(env)))

    def of(self, msg_type):
        return [e for e in self.sent if e["type"] == msg_type]

    def last(self, msg_type):
        got = self.of(msg_type)
        return got[-1] if got else None


# ── 1. the wire contract ──────────────────────────────────────────────────────

def test_envelopes_match_the_live_shape():
    lib, rec = _library(), Recorder()
    sess = ReplaySession(lib, rec)
    asyncio.run(sess.load(SLUG, "race", at=3000))

    types = {e["type"] for e in rec.sent}
    # Exactly the types signalr_client produces — no replay-only data channel.
    assert {"driver_list", "session", "track_status", "timing", "tyres"} <= types

    for env in rec.sent:
        assert set(env) == {"type", "timestamp", "data"}, env["type"]

    timing = rec.last("timing")
    assert timing is not None
    drivers = timing["data"]["drivers"]
    # Full field, not the delta that is stored on disk: the store replaces its
    # timing array outright, so a partial snapshot would blank the rest.
    assert len(drivers) >= 18, len(drivers)
    d = drivers[0]
    for key in ("number", "position", "gap_to_leader", "last_lap", "lap",
                "sector_1", "sector_2", "sector_3", "best_lap_time_in_s",
                "pit_count", "in_pit"):
        assert key in d, key


def test_driver_list_and_session_metadata():
    lib, rec = _library(), Recorder()
    asyncio.run(ReplaySession(lib, rec).load(SLUG, "race"))

    drivers = rec.last("driver_list")["data"]["drivers"]
    assert len(drivers) == 22
    assert {"number", "code", "full_name", "team", "team_colour"} <= set(drivers[0])

    session = rec.last("session")["data"]
    assert session["name"] == "RACE"
    assert session["total_laps"] == 53
    assert session["phase"] == "LIVE"


# ── 2. reconstruction ─────────────────────────────────────────────────────────

def test_seek_reconstructs_rather_than_replaying():
    """
    State at a point has to be the FOLD of everything before it.

    A tower that starts empty and fills in over the next few laps is the
    failure this guards against: pit counts, tyre ages and lap numbers only
    exist because earlier events happened.
    """
    lib, rec = _library(), Recorder()
    sess = ReplaySession(lib, rec)
    asyncio.run(sess.load(SLUG, "race", at=5400))   # ~90 minutes in

    timing = {d["number"]: d for d in rec.last("timing")["data"]["drivers"]}
    tyres = {d["number"]: d for d in rec.last("tyres")["data"]["drivers"]}

    assert max(d["lap"] or 0 for d in timing.values()) > 35
    assert sum(d.get("pit_count") or 0 for d in timing.values()) > 15
    assert any((t.get("age") or 0) > 5 for t in tyres.values())
    assert rec.last("lap_count")["data"]["current"] > 35
    # Flags shown so far are part of the state, not something to re-watch for.
    assert len(rec.last("race_control")["data"]["messages"]) > 10


def test_seek_backwards_is_not_a_forward_fold():
    """
    Counters that only go up make a backwards seek the real test.

    Stepping the playhead forward from wherever it happened to be would leave
    lap 40's pit count showing at lap 5.
    """
    lib, rec = _library(), Recorder()
    sess = ReplaySession(lib, rec)
    asyncio.run(sess.load(SLUG, "race", at=5400))
    late = max(d["lap"] or 0 for d in rec.last("timing")["data"]["drivers"])

    rec.sent.clear()
    asyncio.run(sess.seek(600))
    early_timing = rec.last("timing")["data"]["drivers"]
    early = max(d["lap"] or 0 for d in early_timing)

    assert early < late
    assert early < 12, early
    # Not pit_count: Monza's lap-4 red flag sends the entire field down the pit
    # lane, so it is already high ten minutes in. Tyre age cannot be.
    ages = [t.get("age") or 0 for t in rec.last("tyres")["data"]["drivers"]]
    assert max(ages) < 20, max(ages)


def test_seek_matches_the_classification_at_that_lap():
    """
    The reconstructed order has to be the real order.

    Checked against the finishing classification at the end of the race, which
    is the one moment there is an independent answer for.
    """
    lib, rec = _library(), Recorder()
    sess = ReplaySession(lib, rec)
    asyncio.run(sess.load(SLUG, "race", at=10 ** 6))   # clamps to the end

    order = [d["number"] for d in rec.last("timing")["data"]["drivers"]
             if d.get("position")][:5]
    # Monza 2026: ANT won from P19 on the grid, RUS second, VER third.
    # Numbers are 2026's: Norris carries #1 as champion, Verstappen #3.
    assert order[:3] == [12, 63, 3], order


def test_safety_car_is_reconstructed_as_safety_car():
    """
    Not as a red flag. The distinction was a Phase D fix and a replay that
    smeared the two would hide a regression in it.
    """
    lib = _library()
    stream = lib.stream(SLUG, "race")
    sc = next(m for m in stream["markers"] if m["kind"] == "sc")

    rec = Recorder()
    sess = ReplaySession(lib, rec)
    asyncio.run(sess.load(SLUG, "race", at=sc["t"] + 1))

    assert rec.last("track_status")["data"]["status"] == "4"


# ── 3. per-connection playheads ───────────────────────────────────────────────

def test_two_viewers_keep_separate_positions():
    lib = _library()
    a, b = Recorder(), Recorder()
    sa, sb = ReplaySession(lib, a), ReplaySession(lib, b)

    async def run():
        await sa.load(SLUG, "race", at=600)
        await sb.load(SLUG, "race", at=5400)
        await sa.set_speed(5)
        await sb.seek(4800)

    asyncio.run(run())

    assert sa.position == 600 and sa.speed == 5
    assert sb.position == 4800 and sb.speed == 1
    assert sa.stream is sb.stream       # the recording is shared
    assert sa.state is not sb.state     # the folded state is not

    # Not just different numbers on a scrubber: the two are looking at
    # genuinely different moments of the race.
    #
    # The lap number is the discriminator, and the two points are chosen to
    # straddle the red-flag suspension — between t=295 and t=2253 the field is
    # stationary and the lap count does not move, so two positions inside that
    # window would agree for reasons that have nothing to do with playheads.
    lap_a = max(d["lap"] or 0 for d in a.last("timing")["data"]["drivers"])
    lap_b = max(d["lap"] or 0 for d in b.last("timing")["data"]["drivers"])
    assert lap_a < 10 < lap_b, (lap_a, lap_b)


def test_two_viewers_can_watch_different_sessions():
    lib = _library()
    a, b = Recorder(), Recorder()

    async def run():
        sa, sb = ReplaySession(lib, a), ReplaySession(lib, b)
        await sa.load(SLUG, "race")
        await sb.load(SLUG, "qualifying")
        return sa, sb

    sa, sb = asyncio.run(run())
    assert a.last("session")["data"]["name"] == "RACE"
    assert b.last("session")["data"]["name"] == "QUALIFYING"


# ── transport ─────────────────────────────────────────────────────────────────

def test_playback_advances_and_emits():
    lib, rec = _library(), Recorder()
    sess = ReplaySession(lib, rec)

    async def run():
        await sess.load(SLUG, "race", at=4000)
        await sess.set_speed(10)
        rec.sent.clear()
        await sess.play()
        # At 10x this covers ~35 seconds of race. The widest gap between events
        # in this recording is 120 seconds (the red-flag suspension), but by
        # lap 20 the field crosses the line every few seconds.
        await asyncio.sleep(3.5)
        await sess.pause()

    asyncio.run(run())
    assert sess.position > 3000
    assert rec.of("timing"), "playback emitted no timing"
    assert not sess.playing


def test_next_event_lands_before_the_marker():
    lib, rec = _library(), Recorder()
    sess = ReplaySession(lib, rec)
    stream = lib.stream(SLUG, "race")

    asyncio.run(sess.load(SLUG, "race", at=0))
    asyncio.run(sess.next_event())

    first = stream["markers"][0]["t"]
    # Lands just before it, so the viewer sees the event happen rather than
    # arriving after it.
    assert first - 3 <= sess.position <= first


def test_speed_is_clamped_to_the_offered_set():
    lib, rec = _library(), Recorder()
    sess = ReplaySession(lib, rec)
    asyncio.run(sess.load(SLUG, "race"))
    asyncio.run(sess.set_speed(999))
    assert sess.speed == 1


def test_virtual_now_tracks_the_playhead():
    """
    This is what lets a replay drive the Phase E weekend state machine: the
    frontend feeds it in as `now`, so the recorded weekend's own dates resolve.
    """
    lib, rec = _library(), Recorder()
    sess = ReplaySession(lib, rec)
    asyncio.run(sess.load(SLUG, "race", at=0))
    start = sess.virtual_now()
    asyncio.run(sess.seek(3600))
    later = sess.virtual_now()

    assert start.startswith("2026-09-06")
    assert later > start
    from datetime import datetime
    delta = datetime.fromisoformat(later) - datetime.fromisoformat(start)
    assert abs(delta.total_seconds() - 3600) < 1


# ── commands and containment ──────────────────────────────────────────────────

def test_commands_dispatch_and_non_commands_pass_through():
    lib, rec = _library(), Recorder()
    sess = ReplaySession(lib, rec)

    async def run():
        assert await handle_command(sess, {"cmd": "replay.load",
                                           "weekend": SLUG, "session": "race"})
        assert await handle_command(sess, {"cmd": "replay.seek", "at": 900})
        # Not a replay command: the socket's other traffic must pass through.
        assert not await handle_command(sess, {"type": "pong"})

    asyncio.run(run())
    assert sess.position == 900


def test_bad_commands_do_not_crash_the_connection():
    lib, rec = _library(), Recorder()
    sess = ReplaySession(lib, rec)

    async def run():
        await sess.load(SLUG, "race")
        for bad in ({"cmd": "replay.seek", "at": "not-a-number"},
                    {"cmd": "replay.speed", "speed": None},
                    {"cmd": "replay.load", "weekend": "nope", "session": "race"},
                    {"cmd": "replay.unknown"}):
            await handle_command(sess, bad)

    asyncio.run(run())
    assert rec.of("replay_error")


def test_slug_cannot_escape_the_replay_directory():
    """The slug arrives from a URL, so it is not trusted."""
    lib = _library()
    for evil in ("../../etc", "..\\..\\main.py", "a/../../.."):
        with pytest.raises(ValueError):
            lib._safe(evil)


def test_exit_clears_the_session():
    lib, rec = _library(), Recorder()
    sess = ReplaySession(lib, rec)

    async def run():
        await sess.load(SLUG, "race", at=1200)
        await sess.exit()

    asyncio.run(run())
    assert sess.stream is None
    assert rec.last("replay_state")["data"]["active"] is False


if __name__ == "__main__":
    import sys
    raise SystemExit(pytest.main([__file__, "-q"] + sys.argv[1:]))
