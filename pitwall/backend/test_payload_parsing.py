"""Guard _coerce_payload against the message-mangling regression.

Run: python test_payload_parsing.py

The feed parser used to run, unconditionally, on every string payload:
    data_raw.replace("'", '"').replace("True", "true").replace("False", "false")
That corrupts any payload whose *content* contains an apostrophe or the word
"True", so those messages failed to parse and were silently dropped. Race
control messages contain apostrophes routinely.
"""
import json
import pathlib
import sys
import types

for name in ("requests", "signalrcore", "signalrcore.hub_connection_builder",
             "signalrcore.messages", "signalrcore.messages.completion_message"):
    sys.modules.setdefault(name, types.ModuleType(name))
sys.modules["signalrcore.hub_connection_builder"].HubConnectionBuilder = object
sys.modules["signalrcore.messages.completion_message"].CompletionMessage = type(
    "CompletionMessage", (), {}
)

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from signalr_client import _coerce_payload, clean_race_control  # noqa: E402

fails = []


def check(label, got, want):
    if got != want:
        fails.append(f"  FAIL {label}\n       got  {got!r}\n       want {want!r}")
    else:
        print(f"  ok   {label}")


print("--- dicts pass through untouched ---")
d = {"Messages": [{"Message": "GREEN LIGHT"}]}
check("dict is returned as-is", _coerce_payload(d), d)

print("--- strict JSON ---")
check(
    "plain JSON object",
    _coerce_payload('{"Status": "1", "Message": "AllClear"}'),
    {"Status": "1", "Message": "AllClear"},
)
check("JSON booleans", _coerce_payload('{"InPit": true}'), {"InPit": True})

print("--- the apostrophe regression ---")
apostrophe = json.dumps({"Messages": [{"Message": "CAR 16 (LEC) - DRIVER'S OWN RISK"}]})
check(
    "apostrophe in message survives",
    _coerce_payload(apostrophe)["Messages"][0]["Message"],
    "CAR 16 (LEC) - DRIVER'S OWN RISK",
)
# The exact string the old implementation destroyed.
old_style = apostrophe.replace("'", '"')
check(
    "old mangling would have produced invalid JSON",
    _coerce_payload(old_style),
    None,
)

print("--- the 'True' substring regression ---")
true_word = json.dumps({"Messages": [{"Message": "TRACK LIMITS - True North sector"}]})
check(
    "the word True inside a message survives",
    _coerce_payload(true_word)["Messages"][0]["Message"],
    "TRACK LIMITS - True North sector",
)

print("--- python-repr fallback still handled ---")
check(
    "repr-style dict with True",
    _coerce_payload("{'InPit': True, 'Position': '3'}"),
    {"InPit": True, "Position": "3"},
)
check(
    "repr-style dict with apostrophe in a value",
    _coerce_payload('{"Message": "DRIVER\'S RISK", "Flag": "YELLOW"}')["Message"],
    "DRIVER'S RISK",
)

print("--- malformed input is rejected, not guessed at ---")
check("garbage", _coerce_payload("not json at all {{{"), None)
check("empty string", _coerce_payload(""), None)
check("whitespace", _coerce_payload("   "), None)
check("bare scalar is not a payload", _coerce_payload("42"), None)

print("--- end to end through clean_race_control ---")
parsed = _coerce_payload(apostrophe)
msgs = clean_race_control(parsed)["messages"]
check("message reaches the cleaner intact", msgs[0]["message"], "CAR 16 (LEC) - DRIVER'S OWN RISK")

print()
if fails:
    print("\n".join(fails))
    print(f"{len(fails)} FAILED")
    sys.exit(1)
print("all assertions passed")
