# PITWALL — Race Weekend Notes

This file is for logging observations and issues discovered during live race weekend testing.
Add a section per race weekend, with one sub-section per session.

---

## Template (copy per weekend)

```
## [Race Name] — [Dates]

### FP1 — [date]
- [ ] Backend started: `uvicorn main:app --port 8000`
- [ ] Frontend started: `npm run dev` (localhost:5173)
- [ ] WebSocket connected: check DataMonitor (Ctrl+Shift+D)
- [ ] SignalR connected: check backend log — "SignalR connected to F1 live timing"
- [ ] Topics receiving:  timing, tyres, weather, race_control, driver_list
- [ ] CarData flowing:   DataMonitor shows `car_data` in Topics since connect
- [ ] Notifications:     fired at least one (simulated or real)
- [ ] Sync delay:        tested at 3s, 5s — data visibly delays correctly

**Observations:**
- 

**Issues:**
- 

### FP2 — [date]
...

### FP3 — [date]
...

### Sprint Quali / Sprint — [if applicable]
...

### Q1/Q2/Q3 — [date]
- [ ] Qualifying mode: bestLaps accumulating correctly
- [ ] Knockout styling: Q1 bottom 5, Q2 bottom 5 greyed out
- [ ] DRS notifications firing on "DRS ENABLED" race control message

**Observations:**
- 

### Race — [date]
- [ ] Gap history: gapHistory.length growing each lap
- [ ] Pit stop notifications: firing on in_pit transition
- [ ] Safety car: trackStatus "4" fires notification and banner
- [ ] Fastest lap: purple highlight + notification on overall_fastest driver
- [ ] Weather: rain notification if rainfall starts during race

**Observations:**
- 
```

---

## Saudi Arabian GP — March 21-23, 2026

> **Note:** This was Phase 6's target live test weekend. Backend was not running during this race.
> Next live test: Bahrain GP (March 28-30, 2026).

---

## Bahrain GP — March 28-30, 2026

> **Note:** Bahrain GP window has passed. Live verification will happen at next race.
> Next race: Japanese GP / Chinese GP (check 2026 calendar).

---

## Japanese GP — Next target

### Session Log
*(to be filled in)*

---

## Phase 6 Verification Checklist (run once per weekend)

| Check | Status | Notes |
|-------|--------|-------|
| Backend starts without error | | |
| SignalR connects on attempt 1 | | |
| WS connects within 500ms | | |
| DataMonitor shows topics: timing, tyres, weather | | |
| msg/sec > 2 during live session | | |
| NotificationStack fires on SC | | |
| NotificationStack fires on pit | | |
| Sync delay works at 5s | | |
| Tab background → foreground reconnects | | |
| gap_history grows each lap | | |
| bestLaps accumulate in qualifying | | |
| /api/current-session returns key | | |
