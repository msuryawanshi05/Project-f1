# PITWALL — Phase 2 Data Shapes

All shapes verified from live API calls on 2026-03-11. Source: `data_shapes_raw.json`.

---

## 1. Jolpica API (Ergast) — `https://api.jolpi.ca/ergast/f1`

### MRData Envelope (wraps every response)

```json
{
  "xmlns": "string",
  "series": "f1",
  "url": "string",
  "limit": "string",
  "offset": "string",
  "total": "string",
  "RaceTable": { ... }   // or "StandingsTable", "DriverTable", "CircuitTable"
}
```

### Race (Calendar) — `GET /2026.json`

| Field | Type | Notes |
|---|---|---|
| `season` | string | e.g. `"2026"` |
| `round` | string | e.g. `"1"` |
| `url` | string | Wikipedia URL |
| `raceName` | string | e.g. `"Australian Grand Prix"` |
| `Circuit` | object | See Circuit sub-object below |
| `date` | string | ISO date `"2026-03-08"` |
| `time` | string | UTC time `"05:00:00Z"` (may be absent) |
| `FirstPractice` | object | `{date, time}` |
| `SecondPractice` | object | `{date, time}` |
| `ThirdPractice` | object | `{date, time}` (absent for Sprint weekends) |
| `Qualifying` | object | `{date, time}` |
| `Sprint` | object | `{date, time}` (Sprint weekends only) |

**Circuit sub-object:**
```json
{
  "circuitId": "albert_park",
  "url": "https://en.wikipedia.org/wiki/Albert_Park_Circuit",
  "circuitName": "Albert Park Grand Prix Circuit",
  "Location": {
    "lat": "-37.8497",
    "long": "144.968",
    "locality": "Melbourne",
    "country": "Australia"
  }
}
```

> [!NOTE]
> `lat` and `long` are returned as **strings**, not numbers. Parse with `parseFloat()` in frontend.

### Driver Standing — `GET /2026/driverstandings.json`

| Field | Type |
|---|---|
| `position` | string |
| `positionText` | string |
| `points` | string |
| `wins` | string |
| `Driver` | object (see below) |
| `Constructors` | array of Constructor objects |

**Driver sub-object:**

| Field | Type |
|---|---|
| `driverId` | string — slug, e.g. `"max_verstappen"` |
| `permanentNumber` | string |
| `code` | string — 3 letter, e.g. `"VER"` |
| `url` | string |
| `givenName` | string |
| `familyName` | string |
| `dateOfBirth` | string |
| `nationality` | string |

### Constructor Standing — `GET /2026/constructorstandings.json`

| Field | Type |
|---|---|
| `position` | string |
| `positionText` | string |
| `points` | string |
| `wins` | string |
| `Constructor` | object: `{constructorId, url, name, nationality}` |

### Race Result — `GET /2026/1/results.json`

| Field | Type | Notes |
|---|---|---|
| `number` | string | car number |
| `position` | string | finish position |
| `positionText` | string | `"R"` for retirement |
| `points` | string | |
| `Driver` | object | same Driver shape as above |
| `Constructor` | object | `{constructorId, url, name, nationality}` |
| `grid` | string | quali position |
| `laps` | string | laps completed |
| `status` | string | `"Finished"`, `"+1 Lap"`, `"Engine"` etc |
| `Time` | object | `{millis, time}` — absent if not Finished |
| `FastestLap` | object | `{rank, lap, Time: {millis, time, speed}}` |

### Qualifying Result — `GET /2026/1/qualifying.json`

| Field | Type |
|---|---|
| `number` | string |
| `position` | string |
| `Driver` | object |
| `Constructor` | object |
| `Q1` | string — lap time e.g. `"1:18.123"` |
| `Q2` | string — absent if eliminated in Q1 |
| `Q3` | string — absent if eliminated in Q2 |

### Pit Stop — `GET /2026/1/pitstops.json`

| Field | Type | Notes |
|---|---|---|
| `driverId` | string | |
| `lap` | string | lap number of stop |
| `stop` | string | stop number (1st, 2nd…) |
| `time` | string | time of day e.g. `"13:04:23"` |
| `duration` | string | pit lane time in seconds |

> [!WARNING]
> Pit stop data may not be available immediately after a race. Check `total` in MRData envelope; if `"0"`, no data yet.

### Driver Profile — `GET /2026/drivers.json`

Same as Driver sub-object above: `driverId, permanentNumber, code, url, givenName, familyName, dateOfBirth, nationality`

### Frontend fields we will use from Jolpica

```js
// Calendar
race.round, race.raceName, race.Circuit.Location.country,
race.date, race.time, race.Circuit.circuitId

// Standings
standing.position, standing.points, standing.wins,
standing.Driver.code, standing.Driver.familyName,
standing.Constructors[0].name

// Results
result.position, result.Driver.code, result.Driver.familyName,
result.Constructor.name, result.points, result.status,
result.Time.time, result.FastestLap.Time.time

// Qualifying
qr.position, qr.Driver.code, qr.Q1, qr.Q2, qr.Q3
```

---

## 2. OpenF1 API — `https://api.openf1.org/v1`

All responses are **arrays of objects**. Filter using query params.

### Sessions — `GET /sessions?year=2026`

126 sessions returned for 2026 (all FP1/FP2/FP3/Q/Race).

| Field | Type | Notes |
|---|---|---|
| `session_key` | integer | unique session identifier |
| `session_type` | string | `"Race"`, `"Qualifying"`, `"Practice 1"` etc |
| `session_name` | string | human-readable |
| `date_start` | string | ISO datetime |
| `date_end` | string | ISO datetime |
| `meeting_key` | integer | parent meeting identifier |
| `circuit_key` | integer | |
| `circuit_short_name` | string | e.g. `"Melbourne"` |
| `country_key` | integer | |
| `country_code` | string | e.g. `"AUS"` |
| `country_name` | string | |
| `location` | string | city name |
| `gmt_offset` | string | e.g. `"+11:00"` |
| `year` | integer | |

### Drivers — `GET /drivers?session_key=<key>`

| Field | Type | Notes |
|---|---|---|
| `meeting_key` | integer | |
| `session_key` | integer | |
| `driver_number` | integer | |
| `broadcast_name` | string | e.g. `"M VERSTAPPEN"` |
| `full_name` | string | e.g. `"Max VERSTAPPEN"` |
| `name_acronym` | string | e.g. `"VER"` |
| `team_name` | string | e.g. `"Red Bull Racing"` |
| `team_colour` | string | hex without `#`, e.g. `"3671C6"` |
| `first_name` | string | |
| `last_name` | string | |
| `headshot_url` | string | formula1.com CDN URL |
| `country_code` | string | e.g. `"NED"` |

### Laps — `GET /laps?session_key=<key>&driver_number=<n>`

| Field | Type | Notes |
|---|---|---|
| `meeting_key` | integer | |
| `session_key` | integer | |
| `driver_number` | integer | |
| `lap_number` | integer | |
| `date_start` | string | ISO datetime |
| `duration_sector_1` | float\|null | seconds |
| `duration_sector_2` | float\|null | seconds |
| `duration_sector_3` | float\|null | seconds |
| `i1_speed` | integer\|null | speed trap 1 km/h |
| `i2_speed` | integer\|null | speed trap 2 km/h |
| `is_pit_out_lap` | boolean | |
| `lap_duration` | float\|null | total lap time seconds |
| `segments_sector_1` | array[int] | 8 mini-sectors, colour codes |
| `segments_sector_2` | array[int] | |
| `segments_sector_3` | array[int] | |
| `st_speed` | integer\|null | speed trap finish km/h |

> [!NOTE]
> Segment colour codes: `2048`=purple, `2049`=green, `2051`=yellow, `2064`=white (pit/SC). The frontend timing tower needs this mapping.

### Stints — `GET /stints?session_key=<key>`

| Field | Type | Notes |
|---|---|---|
| `meeting_key` | integer | |
| `session_key` | integer | |
| `stint_number` | integer | 1, 2, 3… |
| `driver_number` | integer | |
| `lap_start` | integer | first lap on this compound |
| `lap_end` | integer | last lap on this compound |
| `compound` | string | `"SOFT"`, `"MEDIUM"`, `"HARD"`, `"INTER"`, `"WET"` |
| `tyre_age_at_start` | integer | laps old when fitted |

### Pit Stops — `GET /pit?session_key=<key>`

| Field | Type | Notes |
|---|---|---|
| `date` | string | ISO datetime |
| `session_key` | integer | |
| `lap_number` | integer | |
| `meeting_key` | integer | |
| `driver_number` | integer | |
| `lane_duration` | float\|null | time in pit lane |
| `pit_duration` | float\|null | total pit stop time |
| `stop_duration` | float\|null | stationary time |

### Car Data (Telemetry) — `GET /car_data?session_key=<key>&driver_number=<n>`

| Field | Type | Notes |
|---|---|---|
| `date` | string | ISO datetime |
| `session_key` | integer | |
| `meeting_key` | integer | |
| `driver_number` | integer | |
| `speed` | integer | km/h |
| `rpm` | integer | engine RPM |
| `brake` | integer | `0` or `100` |
| `throttle` | integer | 0–100 % |
| `drs` | integer | `8`=off, `10`=avail, `12`=on |
| `n_gear` | integer | 1–8 |

### Race Control — `GET /race_control?session_key=<key>`

| Field | Type | Notes |
|---|---|---|
| `meeting_key` | integer | |
| `session_key` | integer | |
| `date` | string | ISO datetime |
| `driver_number` | integer\|null | null = applies to all |
| `lap_number` | integer\|null | |
| `category` | string | `"Flag"`, `"SafetyCar"`, `"Other"`, `"Drs"` |
| `flag` | string\|null | `"GREEN"`, `"YELLOW"`, `"RED"`, `"CHEQUERED"`, `"SC"`, `"VSC"` |
| `scope` | string\|null | `"Track"`, `"Sector"`, `"Driver"` |
| `sector` | integer\|null | 1, 2, 3 |
| `qualifying_phase` | string\|null | `"Q1"`, `"Q2"`, `"Q3"` |
| `message` | string | full race control message text |

### Weather (OpenF1) — `GET /weather?session_key=<key>`

| Field | Type | Notes |
|---|---|---|
| `date` | string | ISO datetime |
| `session_key` | integer | |
| `meeting_key` | integer | |
| `pressure` | float | hPa |
| `track_temperature` | float | °C |
| `air_temperature` | float | °C |
| `humidity` | float | % |
| `wind_speed` | float | m/s |
| `wind_direction` | integer | degrees |
| `rainfall` | integer | `0` or `1` |

### Frontend fields we will use from OpenF1

```js
// Live driver card
driver.driver_number, driver.name_acronym, driver.team_name,
driver.team_colour, driver.headshot_url

// Timing tower lap
lap.driver_number, lap.lap_number, lap.lap_duration,
lap.duration_sector_1, lap.duration_sector_2, lap.duration_sector_3,
lap.segments_sector_1, lap.segments_sector_2, lap.segments_sector_3,
lap.is_pit_out_lap, lap.i1_speed, lap.st_speed

// Tyre strategy
stint.driver_number, stint.compound, stint.lap_start,
stint.lap_end, stint.tyre_age_at_start

// Race control banner
rc.flag, rc.category, rc.message, rc.date, rc.scope

// Pit wall weather strip
weather.air_temperature, weather.track_temperature,
weather.humidity, weather.rainfall, weather.wind_speed
```

---

## 3. Open-Meteo API — `https://api.open-meteo.com/v1`

### Forecast — `GET /forecast?latitude=&longitude=&hourly=...&forecast_days=7`

**Top-level keys:** `latitude`, `longitude`, `generationtime_ms`, `utc_offset_seconds`, `timezone`, `timezone_abbreviation`, `elevation`, `hourly_units`, `hourly`

**`hourly_units`:**
```json
{
  "time": "iso8601",
  "temperature_2m": "°C",
  "precipitation_probability": "%",
  "windspeed_10m": "km/h"
}
```

**`hourly` arrays (168 items = 7 days × 24 hours):**

| Field | Unit | Sample value |
|---|---|---|
| `time` | ISO8601 string | |
| `temperature_2m` | °C | `27.2` |
| `precipitation_probability` | % | `8` |
| `windspeed_10m` | km/h | `17.3` |

> [!NOTE]
> Request with `&wind_direction_10m=true` to also get wind direction. Add `&daily=precipitation_sum` for daily rain totals.

### Frontend fields we will use from Open-Meteo

```js
hourly.time[i], hourly.temperature_2m[i],
hourly.precipitation_probability[i], hourly.windspeed_10m[i]
// Filter by session date range to show race-day forecast
```

---

## 4. Wikipedia REST API — `https://en.wikipedia.org/api/rest_v1`

> [!WARNING]
> **Requires `User-Agent` header** — requests without a proper user-agent receive HTTP 403. Set `User-Agent: PITWALL/0.1 (contact@example.com)` on all requests.

### Page Summary — `GET /page/summary/{article}`

| Field | Type | Notes |
|---|---|---|
| `title` | string | article title |
| `displaytitle` | string | HTML-formatted title |
| `description` | string | short Wikidata description |
| `extract` | string | plain text summary (1–4 paragraphs) |
| `extract_html` | string | HTML version of extract |
| `thumbnail` | object | `{source, width, height}` — may be absent |
| `originalimage` | object | full resolution `{source, width, height}` |
| `coordinates` | object | `{lat, lon}` — present for geographic articles |
| `content_urls` | object | `{desktop, mobile}` → Wikipedia page URLs |
| `lang` | string | `"en"` |
| `dir` | string | `"ltr"` |
| `timestamp` | string | last edit ISO datetime |
| `wikibase_item` | string | Wikidata Q-identifier |

### Frontend fields we will use from Wikipedia

```js
// Circuit info panel
summary.title, summary.description, summary.extract,
summary.thumbnail.source, summary.coordinates
```

---

## 5. Known Issues & Inconsistencies

| API | Issue | Impact | Mitigation |
|---|---|---|---|
| Jolpica | `lat`/`long` are **strings**, not numbers | Can't use directly for maps | `parseFloat()` on use |
| Jolpica | Pit stop data may lag 30–60 min after race | Empty endpoint | Check `MRData.total !== "0"` before rendering |
| Jolpica | `time` field (race start time) absent on some old rounds | Missing start time | Default to `"TBD"` |
| Jolpica | No live data — historical only | Can't use for real-time | Use OpenF1 for live, Jolpica for historical |
| OpenF1 | 2026 sessions return 126 results but no live data yet | Normal | Filter by `session_type === "Race"` and date |
| OpenF1 | `pit_duration` / `stop_duration` often `null` | Calculated field not always available | Fall back to `lane_duration` |
| OpenF1 | `lap_duration` is `null` for pit-out laps | Expected | Show `"OUT LAP"` in UI |
| OpenF1 | Segment colour codes are integers, not strings | Confusing | Map: `2048`→purple, `2049`→green, `2051`→yellow, `2064`→white |
| Open-Meteo | No API key — but rate limits apply | Polling too fast could hit limit | Cache for 1 hour |
| Wikipedia | Returns HTTP 403 without `User-Agent` header | Silent failure | Always set `User-Agent` header in backend proxy |
| Wikipedia | `thumbnail` absent for some circuit articles | Missing image | Fallback to circuit SVG from f1-track-vectors |

---

## 6. Static Data Files

### `frontend/src/data/tyres.json`

Keyed by year → round number (string). Updated manually each race weekend.

### `frontend/src/data/circuits.json`

Array of 24 objects. Key fields:
`round, name, circuit, country, city, lat, lng, timezone, laps, length_km, lap_record, lap_record_holder, lap_record_year, drs_zones, sprint, wikipedia`
