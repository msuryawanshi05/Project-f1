"""Verify live-timing availability reporting.

Run: python test_live_status.py

F1's live timing answers 403 to most datacenter IP ranges, so a hosted
deployment cannot stream it even though the same code works on a laptop. The
failure mode that matters is the silent one: the browser's WebSocket connects
(to our backend), no timing ever arrives, and the dashboard looks broken rather
than degraded. These tests pin the detection and the reported state.
"""
import sys
import types

# Stub the network deps so this runs without installing them.
_requests = types.ModuleType("requests")


class _Resp:
    def __init__(self, status_code):
        self.status_code = status_code
        self.cookies = {}

    def get(self, _k, _d=None):
        return None


_requests.get = lambda *a, **k: _Resp(200)
_requests.options = lambda *a, **k: _Resp(200)
sys.modules.setdefault("requests", _requests)

for name in ("signalrcore", "signalrcore.hub_connection_builder",
             "signalrcore.messages", "signalrcore.messages.completion_message"):
    sys.modules.setdefault(name, types.ModuleType(name))
sys.modules["signalrcore.hub_connection_builder"].HubConnectionBuilder = object
sys.modules["signalrcore.messages.completion_message"].CompletionMessage = type(
    "CompletionMessage", (), {}
)

import pathlib  # noqa: E402
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import signalr_client  # noqa: E402

fails = []


def check(label, got, want):
    if got != want:
        fails.append(f"  FAIL {label}: got {got!r}, want {want!r}")
    else:
        print(f"  ok   {label} = {got!r}")


print("--- a fresh client reports idle, not connected ---")
c = signalr_client.PitwallSignalRClient()
st = c.status()
check("state", st["state"], "idle")
check("connected", st["connected"], False)
check("blocked", st["blocked"], False)
check("no error yet", st["last_error"], None)

print("--- a 403 from F1 is identified as a host block, not a network fault ---")
signalr_client.requests.get = lambda *a, **k: _Resp(403)
blocked_client = signalr_client.PitwallSignalRClient()
result = blocked_client._attempt_connect()
st = blocked_client.status()
check("attempt reports failure", result, False)
check("state", st["state"], "blocked")
check("blocked flag", st["blocked"], True)
check("has an explanatory reason", bool(st["last_error"]), True)
check("reason names the 403", "403" in (st["last_error"] or ""), True)
check("reason explains it is host-based",
      "cloud" in (st["last_error"] or "").lower(), True)

print("--- a blocked host backs off far longer than a normal retry ---")
# 10s against an allowlist that will not change is pointless noise.
import inspect  # noqa: E402
src = inspect.getsource(signalr_client.PitwallSignalRClient._run)
check("blocked retry delay is defined", "BLOCKED_RETRY_DELAY" in src, True)
check("blocked delay is minutes, not seconds", "600" in src, True)

print("--- connect / close transitions ---")
c2 = signalr_client.PitwallSignalRClient()
c2._on_connect()
check("connected -> live", c2.status()["state"], "live")
check("connected flag", c2.status()["connected"], True)
check("connecting clears a previous block", c2.status()["blocked"], False)
c2._on_close()
check("close -> connecting (will retry)", c2.status()["state"], "connecting")
check("close clears connected", c2.status()["connected"], False)

print("--- message timestamps distinguish 'connected' from 'receiving' ---")
c3 = signalr_client.PitwallSignalRClient()
check("no messages yet", c3.status()["last_message_at"], None)
c3._put_message({"type": "timing", "data": {}})
check("timestamp recorded", isinstance(c3.status()["last_message_at"], float), True)

print()
if fails:
    print("\n".join(fails))
    print(f"{len(fails)} FAILED")
    sys.exit(1)
print("all assertions passed")
