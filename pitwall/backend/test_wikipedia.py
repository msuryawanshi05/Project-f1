"""
test_wikipedia.py — Test Wikipedia REST API for circuit summaries in PITWALL Phase 2.
Run with: python test_wikipedia.py
Docs: https://en.wikipedia.org/api/rest_v1/
"""

import requests
import json

BASE = "https://en.wikipedia.org/api/rest_v1"

# Wikipedia requires a proper User-Agent or it returns 403 Forbidden
HEADERS = {"User-Agent": "PITWALL/0.1 (F1 dashboard; contact@example.com)"}

CIRCUITS = [
    ("Albert_Park_Circuit",            "Australian GP — Albert Park"),
    ("Shanghai_International_Circuit", "Chinese GP — Shanghai"),
    ("Suzuka_Circuit",                 "Japanese GP — Suzuka"),
    ("Bahrain_International_Circuit",  "Bahrain GP — Sakhir"),
    ("Jeddah_Street_Circuit",          "Saudi Arabian GP — Jeddah"),
]


def test_summary(article, label):
    url = f"{BASE}/page/summary/{article}"
    print("\n" + "="*70)
    print(f"  {label}")
    print(f"  GET {url}")
    print("="*70)
    try:
        r = requests.get(url, timeout=15, headers=HEADERS)
        r.raise_for_status()
        data = r.json()
        print(f"  Status: {r.status_code} OK")
        print(f"\n  Top-level keys: {list(data.keys())}")
        print(f"\n  title:        {data.get('title')}")
        print(f"  displaytitle: {data.get('displaytitle')}")
        print(f"  description:  {data.get('description')}")

        extract = data.get("extract", "")
        print(f"\n  extract (first 300 chars):")
        print(f"  {extract[:300]}...")

        thumb = data.get("thumbnail")
        if thumb:
            print(f"\n  thumbnail source: {thumb.get('source')}")
            print(f"  thumbnail size:   {thumb.get('width')}x{thumb.get('height')}")
        else:
            print(f"\n  thumbnail: NOT PRESENT")

        coords = data.get("coordinates")
        if coords:
            print(f"\n  coordinates: lat={coords.get('lat')}, lon={coords.get('lon')}")

    except requests.exceptions.RequestException as e:
        print(f"  ERROR: {e}")


if __name__ == "__main__":
    print("PITWALL — Wikipedia REST API Test")
    print(f"Base URL: {BASE}")
    for article, label in CIRCUITS:
        test_summary(article, label)
    print("\n" + "="*70)
    print("  Wikipedia API test complete.")
    print("="*70)
