"""
extract_shapes.py — Extract field names from all APIs and save to data_shapes_raw.json
Run with: python extract_shapes.py
"""
import requests
import json

BASE_JOLPICA = "https://api.jolpi.ca/ergast/f1"
BASE_OPENF1  = "https://api.openf1.org/v1"
BASE_WEATHER = "https://api.open-meteo.com/v1"
BASE_WIKI    = "https://en.wikipedia.org/api/rest_v1"

results = {}


def fetch(url, timeout=20):
    try:
        r = requests.get(url, timeout=timeout)
        r.raise_for_status()
        return r.json(), r.status_code
    except Exception as e:
        return {"error": str(e)}, 0


def sg(lst, idx=0):
    """Safe-get: return lst[idx] or {} if list is empty/not a list."""
    if isinstance(lst, list) and len(lst) > idx:
        return lst[idx]
    return {}


# ── JOLPICA ──────────────────────────────────────────────────────────────────
print("Fetching Jolpica...")

data, _ = fetch(f"{BASE_JOLPICA}/2026.json")
mr = data.get("MRData", {})
race = sg(mr.get("RaceTable", {}).get("Races", []))
results["jolpica_mrdata_keys"] = list(mr.keys())
results["jolpica_race_keys"] = list(race.keys())
results["jolpica_circuit_keys"] = list(sg(race.get("Circuit", {})).keys()) if isinstance(race.get("Circuit"), dict) else list(race.get("Circuit", {}).keys())
results["jolpica_race_sample"] = {k: race[k] for k in list(race.keys())[:6]}

data, _ = fetch(f"{BASE_JOLPICA}/2026/driverstandings.json")
sl = sg(sg(data.get("MRData", {}).get("StandingsTable", {}).get("StandingsLists", [])).get("DriverStandings", []))
results["jolpica_driver_standing_keys"] = list(sl.keys())
results["jolpica_driver_keys"] = list(sl.get("Driver", {}).keys())
results["jolpica_constructor_in_standing_keys"] = list(sg(sl.get("Constructors", [])).keys())

data, _ = fetch(f"{BASE_JOLPICA}/2026/constructorstandings.json")
cl = sg(sg(data.get("MRData", {}).get("StandingsTable", {}).get("StandingsLists", [])).get("ConstructorStandings", []))
results["jolpica_constructor_standing_keys"] = list(cl.keys())
results["jolpica_constructor_keys"] = list(cl.get("Constructor", {}).keys())

data, _ = fetch(f"{BASE_JOLPICA}/2026/1/results.json")
races = data.get("MRData", {}).get("RaceTable", {}).get("Races", [])
rr = sg(sg(races).get("Results", []))
results["jolpica_result_keys"] = list(rr.keys())
results["jolpica_result_driver_keys"] = list(rr.get("Driver", {}).keys())
results["jolpica_result_constructor_keys"] = list(rr.get("Constructor", {}).keys())
results["jolpica_result_time_keys"] = list(rr.get("Time", {}).keys()) if isinstance(rr.get("Time"), dict) else []
results["jolpica_result_fastestlap_keys"] = list(rr.get("FastestLap", {}).keys())

data, _ = fetch(f"{BASE_JOLPICA}/2026/1/qualifying.json")
qr = sg(sg(data.get("MRData", {}).get("RaceTable", {}).get("Races", [])).get("QualifyingResults", []))
results["jolpica_qualifying_keys"] = list(qr.keys())

data, _ = fetch(f"{BASE_JOLPICA}/2026/1/pitstops.json")
ps = sg(sg(data.get("MRData", {}).get("RaceTable", {}).get("Races", [])).get("PitStops", []))
results["jolpica_pitstop_keys"] = list(ps.keys())
results["jolpica_pitstop_note"] = "May be empty if race not yet updated" if not ps else "OK"

data, _ = fetch(f"{BASE_JOLPICA}/2026/drivers.json")
drv = sg(data.get("MRData", {}).get("DriverTable", {}).get("Drivers", []))
results["jolpica_driver_profile_keys"] = list(drv.keys())

data, _ = fetch(f"{BASE_JOLPICA}/2026/circuits.json")
circ = sg(data.get("MRData", {}).get("CircuitTable", {}).get("Circuits", []))
results["jolpica_circuit_profile_keys"] = list(circ.keys())
results["jolpica_circuit_location_keys"] = list(circ.get("Location", {}).keys())


# ── OPENF1 ───────────────────────────────────────────────────────────────────
print("Fetching OpenF1...")
SESSION_KEY = 9161

data, _ = fetch(f"{BASE_OPENF1}/sessions?year=2026")
results["openf1_sessions_2026_count"] = len(data) if isinstance(data, list) else 0
results["openf1_session_keys"] = list(sg(data).keys())

data, _ = fetch(f"{BASE_OPENF1}/drivers?session_key={SESSION_KEY}")
results["openf1_driver_keys"] = list(sg(data).keys())
results["openf1_driver_sample"] = sg(data)

data, _ = fetch(f"{BASE_OPENF1}/laps?session_key={SESSION_KEY}&driver_number=1")
results["openf1_lap_keys"] = list(sg(data).keys())
results["openf1_lap_sample"] = sg(data)

data, _ = fetch(f"{BASE_OPENF1}/stints?session_key={SESSION_KEY}")
results["openf1_stint_keys"] = list(sg(data).keys())
results["openf1_stint_sample"] = sg(data)

data, _ = fetch(f"{BASE_OPENF1}/pit?session_key={SESSION_KEY}")
results["openf1_pit_keys"] = list(sg(data).keys())
results["openf1_pit_sample"] = sg(data)

data, _ = fetch(f"{BASE_OPENF1}/car_data?session_key={SESSION_KEY}&driver_number=1&speed>=300")
results["openf1_car_data_keys"] = list(sg(data).keys())
results["openf1_car_data_sample"] = sg(data)

data, _ = fetch(f"{BASE_OPENF1}/race_control?session_key={SESSION_KEY}")
results["openf1_race_control_keys"] = list(sg(data).keys())
results["openf1_race_control_sample"] = sg(data)

data, _ = fetch(f"{BASE_OPENF1}/weather?session_key={SESSION_KEY}")
results["openf1_weather_keys"] = list(sg(data).keys())
results["openf1_weather_sample"] = sg(data)


# ── OPEN-METEO ───────────────────────────────────────────────────────────────
print("Fetching Open-Meteo...")
data, _ = fetch(
    f"{BASE_WEATHER}/forecast"
    "?latitude=-37.84&longitude=144.95"
    "&hourly=temperature_2m,precipitation_probability,windspeed_10m"
    "&forecast_days=7"
)
hourly = data.get("hourly", {})
results["weather_top_keys"] = list(data.keys())
results["weather_hourly_keys"] = list(hourly.keys())
results["weather_hourly_units"] = data.get("hourly_units", {})
results["weather_forecast_hours"] = len(hourly.get("time", []))
results["weather_sample_temp_0"] = hourly.get("temperature_2m", [None])[0]
results["weather_sample_precip_0"] = hourly.get("precipitation_probability", [None])[0]
results["weather_sample_wind_0"] = hourly.get("windspeed_10m", [None])[0]


# ── WIKIPEDIA ────────────────────────────────────────────────────────────────
print("Fetching Wikipedia...")
data, _ = fetch(f"{BASE_WIKI}/page/summary/Albert_Park_Circuit")
results["wikipedia_top_keys"] = list(data.keys())
results["wikipedia_title"] = data.get("title")
results["wikipedia_description"] = data.get("description")
results["wikipedia_extract_sample"] = str(data.get("extract", ""))[:300]
thumb = data.get("thumbnail") or {}
results["wikipedia_thumbnail_keys"] = list(thumb.keys())
results["wikipedia_thumbnail_url"] = thumb.get("source")
results["wikipedia_coordinates"] = data.get("coordinates")
results["wikipedia_content_urls"] = list(data.get("content_urls", {}).keys())


# ── SAVE ─────────────────────────────────────────────────────────────────────
print("\nSaving results...")
with open("data_shapes_raw.json", "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2, default=str)
print("Saved to data_shapes_raw.json")
print(json.dumps(results, indent=2, default=str))
