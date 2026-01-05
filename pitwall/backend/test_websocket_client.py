"""
test_websocket_client.py â€” PITWALL WebSocket integration test.

Connects to ws://localhost:8000/ws, prints every received message
(type + timestamp + data preview), and exits after 30 seconds.

Usage:
  1. Start backend:   venv\Scriptsvicorn main:app --reload --port 8000
  2. Run this script: venv\Scripts\python test_websocket_client.py

During a live session the script will show real F1 timing messages.
Outside of live sessions it will show the PRE state and any cached data.
"""
import asyncio
import json
import sys
import time

try:
    import websockets
except ImportError:
    print("websockets not installed â€” run: pip install websockets")
    sys.exit(1)

WS_URL   = "ws://localhost:8000/ws"
DURATION = 30  # seconds to listen


async def listen():
    print("=" * 70)
    print(f"  PITWALL â€” WebSocket Client Test")
    print(f"  Connecting to {WS_URL}")
    print(f"  Will listen for {DURATION} seconds")
    print("=" * 70)

    try:
        async with websockets.connect(WS_URL, ping_interval=20) as ws:
            print(f"\n  âœ“ Connected!\n")

            msg_count = 0
            start = time.time()

            while time.time() - start < DURATION:
                remaining = DURATION - (time.time() - start)
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=min(5.0, remaining))
                except asyncio.TimeoutError:
                    if time.time() - start < DURATION:
                        print(f"  (no message for 5s â€” still connected)")
                    continue

                msg_count += 1
                try:
                    msg = json.loads(raw)
                    msg_type  = msg.get("type", "unknown")
                    timestamp = msg.get("timestamp", "")
                    data      = msg.get("data", {})

                    # Pretty-print a preview
                    data_str = json.dumps(data, default=str)
                    preview  = data_str[:280] + ("..." if len(data_str) > 280 else "")

                    print(f"  [{msg_count:03d}] type={msg_type!r:<15} ts={timestamp}")
                    print(f"         {preview}")
                    print()
                except json.JSONDecodeError:
                    print(f"  [{msg_count:03d}] <non-JSON> {raw[:120]}")

    except ConnectionRefusedError:
        print(f"\n  âœ— Could not connect â€” is the backend running on {WS_URL}?")
        print(f"    Start with: venv\\Scripts\vicorn main:app --reload --port 8000")
        sys.exit(1)
    except Exception as e:
        print(f"\n  ERROR: {e}")
        sys.exit(1)

    print("â”€" * 70)
    print(f"  Total messages received: {msg_count}")
    print(f"  Duration: {DURATION}s")
    print("â”€" * 70)


if __name__ == "__main__":
    asyncio.run(listen())

