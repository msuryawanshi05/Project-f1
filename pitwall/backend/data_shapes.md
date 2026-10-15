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
> Segment colour codes: `2048`=**yellow** (slower than own best), `2049`=**green** (personal best),
> `2051`=**purple** (fastest overall), `2064`=**pit lane / not timed**.
>
> Verified empirically on 2026-10-11 against 9,669 real mini-sector values from
> Baku 2026 Qualifying (`session_key=11391`): 2048 occurs 5,118 times (by far the most
> common, so it cannot be purple), 2049 3,926 times, 2051 only 321 times — twelve of
> which fall on the session's fastest lap. 2064 appears on an 822 s in-pit lap.
>
> An earlier revision of this table had `2048` and `2051` swapped, and that error was
> copied into `signalr_client.py` and `driverUtils.js`. Re-run the count before
> changing it back. Canonical copy: `_SEGMENT_COLOUR` in `backend/signalr_client.py`,
> regression-tested by `backend/test_clean_timing.py`.

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
| OpenF1 | Historical endpoints are free; no API key needed (verified 2026-10-11) | None — earlier notes claiming a 401/paid subscription were wrong | Use OpenF1 for post-session, replay and reference data; F1 SignalR for live streaming |
| OpenF1 | `pit_duration` / `stop_duration` often `null` | Calculated field not always available | Fall back to `lane_duration` |
| OpenF1 | `lap_duration` is `null` for pit-out laps | Expected | Show `"OUT LAP"` in UI |
| OpenF1 | Segment colour codes are integers, not strings | Confusing | Map: `2048`→yellow, `2049`→green, `2051`→**purple**, `2064`→pit lane. Verified empirically — see the Laps section. Canonical copy: `_SEGMENT_COLOUR` in `signalr_client.py`. |
| Open-Meteo | No API key — but rate limits apply | Polling too fast could hit limit | Cache for 1 hour |
| Wikipedia | Returns HTTP 403 without `User-Agent` header | Silent failure | Always set `User-Agent` header in backend proxy |
| Wikipedia | `thumbnail` absent for some circuit articles | Missing image | Fallback to the circuit GeoJSON in `frontend/public/trackmaps/` (OSM-traced, 25 circuits) |

---

## 6. Static Data Files

### `frontend/src/data/tyres.json`

Keyed by year → round number (string). Updated manually each race weekend.

### `frontend/src/data/circuits.json`

Array of 24 objects. Key fields:
`round, name, circuit, country, city, lat, lng, timezone, laps, length_km, lap_record, lap_record_holder, lap_record_year, drs_zones, sprint, wikipedia`

---

## 7. Replay Files (`backend/replay/<slug>/`)

Built offline by `scripts/build-replay.py` with FastF1 and committed to the
repo. The deployed backend reads these files and makes **zero outbound API
calls** to serve a replay — which is the point, because F1's live timing
answers 403 to datacenter IP ranges and the public deployment can never show
live timing (see §5).

Everything is written gzipped and served with `Content-Encoding: gzip`, so the
backend never decompresses anything; the browser does.

### Directory layout

```
backend/replay/2026-13-italian/
  manifest.json            # uncompressed, for reading by eye
  manifest.json.gz         # what the backend loads
  race/
    stream.json.gz         # the event stream - everything except telemetry
    fastest-laps.json.gz   # every driver's fastest lap on a distance axis
    telemetry/
      1.json.gz            # one file per driver, fetched on demand
      3.json.gz
      ...
  qualifying/ fp1/ fp2/ fp3/   # same shape
```

### Why the split

Two budgets, two treatments. Lap-granularity data — timing, stints, pit stops,
race control, weather — is a few thousand small records and ships whole. Car
telemetry is not: at source it is a sample every ~240 ms per car per channel,
so a 90-minute race across twenty-two cars is tens of millions of numbers. It
is stored as positional arrays rather than objects (at that volume the repeated
JSON keys outweigh the numbers they label) and split one file per driver, so
the Telemetry tab fetches only the two or three drivers a viewer selects.

Measured for the 2026 Italian GP at 4 Hz telemetry:

| Session    | stream   | telemetry | per driver | fastest-laps |
|------------|----------|-----------|------------|--------------|
| FP1        | 53.7 KB  | 1.8 MB    | 85.7 KB    | 65.1 KB      |
| FP2        | 55.1 KB  | 2.0 MB    | 91.9 KB    | 65.0 KB      |
| FP3        | 47.9 KB  | 1.8 MB    | 82.8 KB    | 65.7 KB      |
| QUALIFYING | 31.8 KB  | 1.4 MB    | 67.2 KB    | 65.8 KB      |
| RACE       | 85.8 KB  | 3.1 MB    | 143.4 KB   | 63.1 KB      |
| **total**  |          |           |            | **10.7 MB**  |

Watching the race tower costs **85.8 KB** — and not even over HTTP: the stream
is pushed down the WebSocket the page already has open. Telemetry is the only
thing a viewer downloads, one driver at a time.

Telemetry is recorded at **4 Hz**, which is F1's own CarData rate, so nothing
is lost. 2 Hz halves the size (6.2 MB total, 79 KB per driver for the race) and
was the first choice; at 10.7 MB the budget did not require the compromise.

### `manifest.json`

```jsonc
{
  "slug": "2026-13-italian",
  "year": 2026, "round": 13,
  "name": "Italian Grand Prix",
  "location": "Monza", "country": "Italy",
  "event_date": "2026-09-06",
  "telemetry_hz": 4.0,
  "sessions": [
    {
      "key": "Qualifying",        // Jolpica's schedule key, so a replay session
                                  // can be matched to the weekend state machine
      "label": "QUALIFYING",
      "kind": "qualifying",       // practice | qualifying | race
      "duration_s": 3842.0,
      "date_start_utc": "2026-09-05T14:00:00.032000+00:00",
      "total_laps": null,         // races only
      "markers": 3,
      "telemetry_drivers": [1, 3, 5],
      "has_fastest_laps": true,
      "bytes": { "stream": 31826, "telemetry": 1507328, "fastest": 67399 }
    }
  ]
}
```

`date_start_utc` **always carries an offset.** JavaScript parses a date-time
with no offset as *local* time, so a naive string shifted the replay's virtual
clock by the viewer's own offset — which fed a wrong `now` into the weekend
state machine and put the page on the wrong session. Same class of bug as the
bare `14:00:00` handled in `utils/sessionSchedule.js`.

### `<session>/stream.json.gz`

```jsonc
{
  "label": "RACE", "kind": "race",
  "duration_s": 7101.2,
  "date_start_utc": "2026-09-06T13:03:30.937000+00:00",
  "total_laps": 53,
  "drivers": [ /* the driver_list payload, verbatim */ ],
  "markers": [ { "t": 199.4, "kind": "sc", "label": "Safety car" } ],
  "events": [ { "t": 12.34, "type": "timing", "data": { } } ]
}
```

`t` is **seconds from the green light**, not from the start of the timing feed.
FastF1 mixes two clocks — laps, track status, weather and car data carry a
Timedelta from the feed's start (which begins ~13 minutes before the session),
while race control messages carry an absolute datetime — and a playhead has to
be one clock. `Session.session_start_time` and `Session.t0_date` reconcile
them. Events stamped before the green light are clamped to `t: 0`, so they form
the starting state rather than being dropped.

**`data` payloads are the exact dicts `signalr_client.clean_*` produces.** The
replay broadcaster wraps them in the same envelope and pushes them down the
same WebSocket into the same store. Replay has no rendering path of its own; if
it did, the two would drift and replay would stop being evidence that the live
path works.

`event.type` is one of: `timing`, `tyres`, `track_status`, `race_control`,
`weather`, `lap_count` — the same set `_TOPIC_CLEANERS` emits.

**Events are deltas.** A `timing` event carries only the drivers whose state
changed, exactly as the real TimingData feed does. `replay_engine._SessionState`
folds them into the full snapshots the wire format requires — the frontend
store replaces its timing array outright, so a partial snapshot would blank the
rest of the field. Seeking re-folds from `t: 0`, which is also the only way
scrubbing backwards can work: pit counts and tyre ages only go up.

`markers.kind` is `sc`, `vsc`, `red`, `flag`, `pit` or `lead`. They drive the
scrub bar's ticks and the "next event" jump. Pit and lead markers are race-only
— a pit entry in qualifying is a car going back to the garage, and marking all
104 of them would bury the three moments worth jumping to.

### `<session>/telemetry/<driver>.json.gz`

```jsonc
{
  "driver_number": 12,
  "hz": 4.0,
  "channels": ["t", "speed", "rpm", "gear", "throttle", "brake", "drs"],
  "samples": [ [0.0, 312, 11450, 7, 100, 0, 1], [0.25, 315, 11600, 7, 100, 0, 1] ]
}
```

Samples sit on a fixed grid, so finding the playhead is arithmetic rather than
a search. Downsampling takes the **nearest** source sample to each grid point,
not a mean: a mean would invent brake values between 0 and 100 that the car
never had, and smear gear changes across two gears. `brake` is 0 or 100, `drs`
is 0 or 1.

### `<session>/fastest-laps.json.gz`

```jsonc
{
  "12": {
    "driver_number": 12, "lap_number": 16,
    "lap_time": "1:21.846", "lap_time_s": 81.846,
    "distance": [0.0, 14.5],        // 400 points, 0 .. lap length in metres
    "speed": [], "throttle": [], "brake": [], "gear": [],
    "time": []                      // elapsed seconds at each point
  }
}
```

Separate from the time-series telemetry above, and tiny, because a two-driver
lap comparison is only meaningful against **distance**: compared against time,
the slower car's trace drifts further behind at every corner and the two stop
describing the same piece of track.

`time` is normalised so its last value **is** `lap_time_s`. The telemetry
samples do not begin and end exactly on the timing line — they are a 4 Hz
stream clipped to the lap — so raw elapsed time runs short by up to a percent.
Unnormalised, the delta trace between two drivers ended at +0.441 s when the
two laps were 0.060 s apart, making the one number on the chart a viewer can
check against the timing screen wrong.

Each driver's lap is on its own distance grid (lap lengths differ by a few
metres), so `LapCompare.jsx` interpolates the second driver onto the first's
grid before subtracting. Index-by-index subtraction would compare slightly
different points of the circuit, and the error grows along the lap.

### Transport (WebSocket commands)

Replay is driven over the **existing** `/ws` socket, not a second endpoint.
Client to server:

| command | fields | effect |
|---|---|---|
| `replay.load` | `weekend`, `session`, `at` | load and seek, paused |
| `replay.play` / `replay.pause` | — | start/stop the playhead |
| `replay.speed` | `speed` in {1,2,5,10} | playback rate |
| `replay.seek` | `at` (seconds) | re-fold and emit the state at that point |
| `replay.next_event` | — | jump to just before the next marker |
| `replay.exit` | — | leave replay; the tab returns to the live feed |
| `replay.status` | — | re-announce |

Server to client adds two envelope types to the existing set: `replay_state`
(position, speed, playing, `virtual_now`, and on transport changes the
weekend/session metadata) and `replay_error`.

**State is per connection.** The live broadcaster fans one upstream feed out to
every client, which is right — there is one race and everyone is watching the
same moment of it. Replay is the opposite: on a public URL two viewers must not
fight over the scrubber, so each socket owns its own `ReplaySession` with its
own playhead, speed and session. Only the recorded data is shared, and it is
read-only.

Sockets in replay are excluded from the live broadcast (`replay_clients` in
`main.py`): the live feed's `phase=PRE` session envelope calls
`resetLiveSession()` in the store, which would wipe a replay mid-playback.

### HTTP endpoints

| route | returns |
|---|---|
| `GET /api/replay` | the catalogue; `available: false` when nothing is built |
| `GET /api/replay/{slug}/{session}/markers` | scrub-bar markers and duration |
| `GET /api/replay/{slug}/{session}/telemetry/{driver}` | one driver's samples |
| `GET /api/replay/{slug}/{session}/fastest-laps` | all drivers' fastest laps |

The event stream itself has no HTTP route. It only ever travels down the
WebSocket, because that is the live path and using anything else would defeat
the purpose.
