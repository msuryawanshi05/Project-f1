"""Exercise clean_timing against a representative F1 SignalR TimingData payload.

Run: python test_clean_timing.py

Guards the two regressions that made the timing tower wrong for every session:
  - sector/mini-sector colour codes (2048 and 2051 were swapped)
  - sector colour read from a non-existent "Colour" key, so nothing was ever
    green or purple
plus the seven TimingData fields that were never extracted at all.
"""
import pathlib
import sys
import types

# The cleaner functions are pure stdlib; stub the network deps so this runs
# without installing requests/signalrcore.
for name in ("requests", "signalrcore", "signalrcore.hub_connection_builder",
             "signalrcore.messages", "signalrcore.messages.completion_message"):
    sys.modules.setdefault(name, types.ModuleType(name))
sys.modules["signalrcore.hub_connection_builder"].HubConnectionBuilder = object
sys.modules["signalrcore.messages.completion_message"].CompletionMessage = type(
    "CompletionMessage", (), {}
)

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from signalr_client import clean_timing, clean_session  # noqa: E402

PAYLOAD = {
    "Lines": {
        # P1: overall-fastest lap, purple S1, green S2, 2 stops, speed traps
        "1": {
            "RacingNumber": "1", "Position": "1", "NumberOfLaps": 34,
            "GapToLeader": "", "IntervalToPositionAhead": {"Value": ""},
            "LastLapTime": {"Value": "1:32.741", "PersonalFastest": True, "OverallFastest": True},
            "BestLapTime": {"Value": "1:32.741", "Lap": 34},
            "NumberOfPitStops": 2,
            "Speeds": {"I1": {"Value": "291"}, "I2": {"Value": "268"},
                       "FL": {"Value": "312"}, "ST": {"Value": "334"}},
            "Sectors": {
                "0": {"Value": "29.183", "OverallFastest": True, "PersonalFastest": True,
                      "Segments": {"0": {"Status": 2051}, "1": {"Status": 2049},
                                   "2": {"Status": 2048}, "3": {"Status": 2051}}},
                "1": {"Value": "40.264", "OverallFastest": False, "PersonalFastest": True,
                      "Segments": {"0": {"Status": 2049}, "1": {"Status": 2049}}},
                "2": {"Value": "23.294", "OverallFastest": False, "PersonalFastest": False,
                      "Segments": {"0": {"Status": 2048}}},
            },
            "BestSectors": {"0": {"Value": "29.183"}, "1": {"Value": "40.264"},
                            "2": {"Value": "23.100"}},
        },
        # P2: slower best lap, in the pit lane, 1 stop
        "81": {
            "RacingNumber": "81", "Position": "2", "NumberOfLaps": 34,
            "GapToLeader": {"Value": "+4.182"}, "IntervalToPositionAhead": {"Value": "+4.182"},
            "LastLapTime": {"Value": "1:33.902", "PersonalFastest": False, "OverallFastest": False},
            "BestLapTime": {"Value": "1:33.118", "Lap": 29},
            "NumberOfPitStops": 1, "InPit": True,
            "Sectors": {"0": {"Value": "29.901", "Segments": {"0": {"Status": 2064}}}},
        },
        # P3: lapped, retired on track
        "44": {
            "RacingNumber": "44", "Position": "3", "NumberOfLaps": 31,
            "GapToLeader": {"Value": "+1 LAP"},
            "LastLapTime": {"Value": "1:41.332"},
            "Retired": True, "Stopped": True, "NumberOfPitStops": 1,
            "Sectors": {},
        },
        # Sectors arriving as a LIST rather than a dict (F1 does both)
        "63": {
            "RacingNumber": "63", "Position": "4", "NumberOfLaps": 34,
            "LastLapTime": {"Value": "1:33.401"},
            "BestLapTime": {"Value": "1:33.044"},
            "Sectors": [
                {"Value": "29.500", "PersonalFastest": True, "Segments": [{"Status": 2049}]},
                {"Value": "40.800"},
                {},
            ],
        },
    }
}

out = clean_timing(PAYLOAD)["drivers"]
by_num = {d["number"]: d for d in out}

fails = []


def check(label, got, want):
    if got != want:
        fails.append(f"  FAIL {label}: got {got!r}, want {want!r}")
    else:
        print(f"  ok   {label} = {got!r}")


print("--- sector colours (the inverted-table bug) ---")
check("P1 S1 purple (OverallFastest)", by_num[1]["s1_colour"], "purple")
check("P1 S2 green (PersonalFastest)", by_num[1]["s2_colour"], "green")
check("P1 S3 yellow (neither)", by_num[1]["s3_colour"], "yellow")
check("P1 no sector value -> ''", by_num[44]["s1_colour"], "")

print("--- mini-sectors (2048/2051 no longer swapped) ---")
check("P1 S1 segments", by_num[1]["s1_segments"], ["purple", "green", "yellow", "purple"])
check("P2 S1 segment = pit", by_num[81]["s1_segments"], ["pit"])

print("--- previously-missing fields ---")
check("best lap string", by_num[1]["best_lap"], "1:32.741")
check("best lap seconds", round(by_num[1]["best_lap_time_in_s"], 3), 92.741)
check("best lap purple (P1)", by_num[1]["best_lap_overall_fastest"], True)
check("best lap not purple (P2)", by_num[81]["best_lap_overall_fastest"], False)
check("pit count", by_num[1]["pit_count"], 2)
check("pit count (absent -> None)", by_num[63]["pit_count"], None)
check("speed trap ST", by_num[1]["speed_trap"], 334)
check("speed I1", by_num[1]["speed_i1"], 291)
check("speed (absent -> None)", by_num[81]["speed_trap"], None)
check("retired flag", by_num[44]["retired"], True)
check("retired false by default", by_num[1]["retired"], False)
check("best sector 3", by_num[1]["best_s3_time_in_s"], 23.1)
check("interval to car ahead", by_num[81]["gap_to_ahead"], "+4.182")

print("--- list-shaped Sectors still parse ---")
check("P4 S1 green from list", by_num[63]["s1_colour"], "green")
check("P4 S1 time from list", by_num[63]["s1_time_in_s"], 29.5)
check("P4 S3 empty from list", by_num[63]["s3_colour"], "")

print("--- full-precision sector times survive ---")
check("S3 is 23.294 not 23.29", by_num[1]["s3_time_in_s"], 23.294)

print("--- clean_session no longer claims a lap number ---")
check("session.lap is None", clean_session({"Name": "Race", "Status": "Started"})["lap"], None)

print()
if fails:
    print("\n".join(fails))
    print(f"{len(fails)} FAILED")
    sys.exit(1)
print("all assertions passed")
