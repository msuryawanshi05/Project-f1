"""
test_openf1.py — Test all OpenF1 API endpoints for PITWALL Phase 2.
Run with: python test_openf1.py
Docs: https://openf1.org/
"""

import requests
import json

BASE = "https://api.openf1.org/v1"

# session_key=9161 is the 2023 Dutch GP race session (known good session)
SESSION_KEY = 9161

ENDPOINTS = [
    ("/sessions?year=2026",                                              "Sessions — 2026"),
    (f"/drivers?session_key={SESSION_KEY}",                              f"Drivers — Session {SESSION_KEY}"),
    (f"/laps?session_key={SESSION_KEY}&driver_number=1",                 f"Laps — Verstappen (driver 1)"),
    (f"/stints?session_key={SESSION_KEY}",                               f"Stints — All Drivers"),
    (f"/pit?session_key={SESSION_KEY}",                                  f"Pit Stops — Session {SESSION_KEY}"),
    (f"/car_data?session_key={SESSION_KEY}&driver_number=1&speed>=300",  f"Car Data — Speed >=300 (Verstappen)"),
    (f"/race_control?session_key={SESSION_KEY}",                         f"Race Control Messages"),
    (f"/weather?session_key={SESSION_KEY}",                              f"Weather Data"),
]

def print_sample(items, label):
    """Print the first item of an array response."""
    if not isinstance(items, list):
        print(f"  Response is not a list — type: {type(items).__name__}")
        return
    print(f"  Item count: {len(items)}")
    if items:
        print(f"  Keys in first item: {list(items[0].keys())}")
        print(f"  Sample first item:")
        print("  " + json.dumps(items[0], indent=2, default=str)[:600])

def test_endpoint(path, label):
    url = BASE + path
    print("\n" + "="*70)
    print(f"  {label}")
    print(f"  GET {url}")
    print("="*70)
    try:
        r = requests.get(url, timeout=20)
        r.raise_for_status()
        data = r.json()
        print(f"  Status: {r.status_code} OK")
        print_sample(data, label)
    except requests.exceptions.RequestException as e:
        print(f"  ERROR: {e}")

if __name__ == "__main__":
    print("PITWALL — OpenF1 API Test")
    print(f"Base URL: {BASE}")
    for path, label in ENDPOINTS:
        test_endpoint(path, label)
    print("\n" + "="*70)
    print("  All OpenF1 endpoint tests complete.")
    print("="*70)
