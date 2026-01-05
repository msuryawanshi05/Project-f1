"""
test_signalr_past.py â€” CRITICAL: Run this FIRST before any live testing.

Loads a past F1 session via FastF1 to verify data shapes match data_shapes.md.
Tests: laps, results, weather, race control, car data.

Usage: python test_signalr_past.py
"""
import sys
import fastf1
import pandas as pd

# Force UTF-8 output on Windows to avoid charmap errors
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

# Enable cache for faster subsequent runs
fastf1.Cache.enable_cache("ff1_cache")

SEP  = "=" * 70
DASH = "-" * 70

print(SEP)
print("  PITWALL -- FastF1 Past Session Data Shape Verification")
print("  Session: 2024 Australian GP -- Race")
print(SEP)

print("\nLoading session (this may take a minute on first run)...")
session = fastf1.get_session(2024, "Australia", "R")
session.load()
print(f"  Session loaded: {session.name} â€” {session.date}")

# â”€â”€ 1. Laps â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
print("\n" + "â”€" * 70)
print("  1. Laps â€” first 5 rows")
print("â”€" * 70)
lap_cols = ["LapNumber", "LapTime", "Sector1Time", "Sector2Time", "Sector3Time",
            "Driver", "Team", "Compound", "TyreLife", "IsPersonalBest"]
available_lap_cols = [c for c in lap_cols if c in session.laps.columns]
print(session.laps[available_lap_cols].head(5).to_string(index=False))
print(f"\n  All lap columns: {list(session.laps.columns)}")

# â”€â”€ 2. Results â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
print("\n" + "â”€" * 70)
print("  2. Results â€” first 5 drivers")
print("â”€" * 70)
res_cols = ["DriverNumber", "FullName", "Abbreviation", "TeamName",
            "Position", "Points", "Status", "Time", "GridPosition"]
available_res_cols = [c for c in res_cols if c in session.results.columns]
print(session.results[available_res_cols].head(5).to_string(index=False))
print(f"\n  All result columns: {list(session.results.columns)}")

# â”€â”€ 3. Weather â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
print("\n" + "â”€" * 70)
print("  3. Weather â€” first 5 rows")
print("â”€" * 70)
wx_cols = ["Time", "AirTemp", "TrackTemp", "Humidity", "WindSpeed",
           "WindDirection", "Rainfall", "Pressure"]
available_wx_cols = [c for c in wx_cols if c in session.weather_data.columns]
print(session.weather_data[available_wx_cols].head(5).to_string(index=False))
print(f"\n  All weather columns: {list(session.weather_data.columns)}")

# â”€â”€ 4. Race Control Messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
print("\n" + "â”€" * 70)
print("  4. Race Control Messages â€” first 8 messages")
print("â”€" * 70)
rc_cols = ["Time", "Category", "Message", "Flag", "Scope", "RacingNumber"]
available_rc_cols = [c for c in rc_cols if c in session.race_control_messages.columns]
pd.set_option("display.max_colwidth", 60)
print(session.race_control_messages[available_rc_cols].head(8).to_string(index=False))
print(f"\n  All RC columns: {list(session.race_control_messages.columns)}")

# â”€â”€ 5. Car Data (Telemetry) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
print("\n" + "â”€" * 70)
print("  5. Car Data (Telemetry) â€” first 5 rows for driver 1")
print("â”€" * 70)
try:
    # Get car data for Verstappen (driver number 1)
    ver_laps = session.laps.pick_driver("VER")
    car_data = ver_laps.iloc[5].get_car_data()  # lap 6 â€” should be a proper flying lap
    car_cols = ["Speed", "RPM", "nGear", "Throttle", "Brake", "DRS"]
    available_car_cols = [c for c in car_cols if c in car_data.columns]
    print(car_data[available_car_cols].head(5).to_string(index=False))
    print(f"\n  DRS unique values: {car_data['DRS'].unique()}")
    print(f"  Brake unique values: {car_data['Brake'].unique()[:5]}")
    print(f"  All car_data columns: {list(car_data.columns)}")
except Exception as e:
    print(f"  Car data error (non-fatal): {e}")

# â”€â”€ Summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
print("\n" + "=" * 70)
print("  SHAPE VERIFICATION COMPLETE")
print("=" * 70)
print(f"  Laps:          {len(session.laps)} rows")
print(f"  Results:       {len(session.results)} rows")
print(f"  Weather:       {len(session.weather_data)} rows")
print(f"  Race Control:  {len(session.race_control_messages)} messages")
print("\n  Cross-check these fields against backend/data_shapes.md before")
print("  proceeding to live stream testing.")
print("=" * 70)

