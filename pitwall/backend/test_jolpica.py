"""
test_jolpica.py — Test all Jolpica (Ergast) API endpoints for PITWALL Phase 2.
Run with: python test_jolpica.py
Docs: https://api.jolpi.ca/
"""

import requests
import json

BASE = "https://api.jolpi.ca/ergast/f1"

ENDPOINTS = [
    ("/2026.json",                           "2026 Race Calendar"),
    ("/2026/driverstandings.json",           "Driver Championship Standings"),
    ("/2026/constructorstandings.json",      "Constructor Championship Standings"),
    ("/2026/1/results.json",                 "Race Results — Round 1 (AUS)"),
    ("/2026/1/qualifying.json",              "Qualifying Results — Round 1 (AUS)"),
    ("/2026/1/pitstops.json",                "Pit Stops — Round 1 (AUS)"),
    ("/2026/drivers.json",                   "All 2026 Drivers"),
    ("/2026/circuits.json",                  "All 2026 Circuits"),
]

def print_keys(obj, prefix="", depth=2):
    """Recursively print keys up to a given depth."""
    if depth == 0 or not isinstance(obj, (dict, list)):
        return
    if isinstance(obj, list):
        if obj:
            print(f"{prefix}[0] (first item):")
            print_keys(obj[0], prefix + "  ", depth - 1)
    elif isinstance(obj, dict):
        for k, v in obj.items():
            vtype = type(v).__name__
            if isinstance(v, list):
                vtype = f"list[{len(v)}]"
            print(f"{prefix}{k}: {vtype}")
            print_keys(v, prefix + "  ", depth - 1)

def test_endpoint(path, label):
    url = BASE + path
    print("\n" + "="*70)
    print(f"  {label}")
    print(f"  GET {url}")
    print("="*70)
    try:
        r = requests.get(url, timeout=15)
        r.raise_for_status()
        data = r.json()
        print(f"  Status: {r.status_code} OK")
        print(f"\n  Top-level keys:")
        print_keys(data, prefix="    ", depth=4)
        # Print first data item as a sample
        mr = data.get("MRData", {})
        for key in mr:
            val = mr[key]
            if isinstance(val, dict):
                for subkey, subval in val.items():
                    if isinstance(subval, list) and subval:
                        print(f"\n  Sample first item in MRData.{key}.{subkey}[0]:")
                        print("  " + json.dumps(subval[0], indent=2)[:800])
                        break
    except requests.exceptions.RequestException as e:
        print(f"  ERROR: {e}")

if __name__ == "__main__":
    print("PITWALL — Jolpica API Test")
    print(f"Base URL: {BASE}")
    for path, label in ENDPOINTS:
        test_endpoint(path, label)
    print("\n" + "="*70)
    print("  All Jolpica endpoint tests complete.")
    print("="*70)
