"""
test_weather.py — Test Open-Meteo weather forecast API for PITWALL Phase 2.
Run with: python test_weather.py
Docs: https://open-meteo.com/en/docs
"""

import requests
import json

BASE = "https://api.open-meteo.com/v1"

# Melbourne, Australia — Australian Grand Prix (Albert Park)
CIRCUITS = [
    {
        "name": "Australian GP — Melbourne",
        "lat": -37.84,
        "lng": 144.95,
    },
]

def test_forecast(circuit):
    url = (
        f"{BASE}/forecast"
        f"?latitude={circuit['lat']}"
        f"&longitude={circuit['lng']}"
        f"&hourly=temperature_2m,precipitation_probability,windspeed_10m"
        f"&forecast_days=7"
    )
    print("\n" + "="*70)
    print(f"  Weather Forecast — {circuit['name']}")
    print(f"  GET {url}")
    print("="*70)
    try:
        r = requests.get(url, timeout=15)
        r.raise_for_status()
        data = r.json()
        print(f"  Status: {r.status_code} OK")
        print(f"\n  Top-level keys: {list(data.keys())}")

        # Confirm required fields
        hourly = data.get("hourly", {})
        hourly_units = data.get("hourly_units", {})
        required = ["temperature_2m", "precipitation_probability", "windspeed_10m"]
        print(f"\n  Hourly keys present: {list(hourly.keys())}")
        print(f"  Hourly units: {json.dumps(hourly_units, indent=2)}")
        for field in required:
            ok = field in hourly
            sample = hourly.get(field, [None])[0]
            print(f"  ✓ {field}: {'PRESENT' if ok else 'MISSING'} — sample[0]={sample}")

        # Location info
        print(f"\n  latitude: {data.get('latitude')}")
        print(f"  longitude: {data.get('longitude')}")
        print(f"  timezone: {data.get('timezone')}")
        print(f"  timezone_abbreviation: {data.get('timezone_abbreviation')}")
        print(f"  elevation: {data.get('elevation')}m")
        print(f"  forecast hours: {len(hourly.get('time', []))}")

    except requests.exceptions.RequestException as e:
        print(f"  ERROR: {e}")

if __name__ == "__main__":
    print("PITWALL — Open-Meteo Weather API Test")
    print(f"Base URL: {BASE}")
    for circuit in CIRCUITS:
        test_forecast(circuit)
    print("\n" + "="*70)
    print("  Open-Meteo test complete.")
    print("="*70)
