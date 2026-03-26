import { create } from 'zustand'

// Load persisted settings from localStorage on init
function loadSettings() {
  try {
    const raw = localStorage.getItem('pitwall_settings')
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) }
  } catch (_) {}
  return defaultSettings
}

const defaultSettings = {
  favouriteDrivers: [],
  soundEnabled: true,
  syncDelaySeconds: 0,
  darkMode: true,
}

const useF1Store = create((set, get) => ({
  // ── Live session state (WebSocket) ──────────────────────────────────────────
  session: {
    name: null,
    status: null,
    phase: 'PRE',
    lap: null,
    total_laps: null,
    clock: null,
  },

  trackStatus: {
    status: '1',    // "1"=Green "2"=Yellow "4"=SC "5"=Red "6"=VSC
    message: null,
  },

  drivers: [],        // 20 driver objects from "driver_list"
  timing: [],         // 20 timing objects from "timing"
  tyres: [],          // 20 tyre objects from "tyres"
  weather: null,      // single weather object
  raceControl: [],    // last 50 race control messages
  carData: {},        // { [driverNumber]: { speed, rpm, gear, throttle, brake, drs } }

  // ── Strategy chart gap history ──────────────────────────────────────────────
  gapHistory: [],     // [{ lap, gap_<number>: seconds, ... }] — last 100 laps
  // ── Telemetry driver selection ──────────────────────────────────────────────
  selectedTelemetryDriver: null,
  compareTelemetryDriver: null,
  // ── Radio playback ──────────────────────────────────────────────────────────
  playingRadioId: null,

  // ── Notification queue (for Phase 7 popup system) ──────────────────────────
  notifications: [],

  // ── User settings (persisted to localStorage) ──────────────────────────────
  settings: loadSettings(),

  // ── REST API data (Jolpica + OpenF1) ───────────────────────────────────────
  calendarLoading: true,   // true until setCalendar() is called
  calendar: [],
  standings: {
    drivers: [],
    constructors: [],
  },
  results: {},   // { [round]: resultData }

  // ── Actions ────────────────────────────────────────────────────────────────

  setSession: (session) => set({ session }),

  setTrackStatus: (trackStatus) => set({ trackStatus }),

  setDrivers: (drivers) => set({ drivers }),

  setTiming: (timing) => set({ timing }),

  setTyres: (tyres) => set({ tyres }),

  setWeather: (weather) => set({ weather }),

  addRaceControl: (message) =>
    set((state) => ({
      raceControl: [message, ...state.raceControl].slice(0, 50),
    })),

  setCarData: (driverNumber, data) =>
    set((state) => ({
      carData: { ...state.carData, [driverNumber]: data },
    })),

  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        {
          id: Date.now(),
          type: notification.type,                  // "critical"|"high"|"medium"|"info"
          event: notification.event,                // "safety_car"|"penalty"|"pit"|"fastest_lap" etc
          title: notification.title,
          message: notification.message,
          driverNumber: notification.driverNumber ?? null,
          timestamp: new Date().toISOString(),
          dismissed: false,
        },
        ...state.notifications.slice(0, 9),         // keep max 10
      ],
    })),

  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  updateSettings: (partial) => {
    const next = { ...get().settings, ...partial }
    try {
      localStorage.setItem('pitwall_settings', JSON.stringify(next))
    } catch (_) {}
    set({ settings: next })
  },

  setCalendar: (calendar) => set({ calendar, calendarLoading: false }),

  setStandings: (drivers, constructors) =>
    set({ standings: { drivers, constructors } }),

  setResults: (round, data) =>
    set((state) => ({
      results: { ...state.results, [round]: data },
    })),

  // ── Phase 5c: Gap history accumulation ─────────────────────────────────────
  updateGapHistory: (timingArr, currentLap) =>
    set((state) => {
      if (!currentLap) return {}
      const entry = { lap: currentLap }
      timingArr.forEach((d) => {
        const num = d.driver_number ?? d.number
        if (!num) return
        const parsed = parseGapRaw(d.gap_to_leader ?? d.gap)
        if (parsed !== null) entry[`gap_${num}`] = parsed
      })
      const next = [...state.gapHistory, entry]
      return { gapHistory: next.slice(-100) }
    }),

  // ── Phase 5c: Telemetry driver selection ────────────────────────────────────
  setSelectedTelemetryDriver: (driverNumber) =>
    set({ selectedTelemetryDriver: driverNumber }),

  setCompareTelemetryDriver: (driverNumber) =>
    set({ compareTelemetryDriver: driverNumber }),

  // ── Phase 5c: Radio playback ────────────────────────────────────────────────
  setPlayingRadioId: (id) => set({ playingRadioId: id }),
}))

// Private helper — avoids importing driverUtils into the store
function parseGapRaw(gap) {
  if (!gap || gap === 'LEADER') return 0
  const s = String(gap).replace('+', '').trim()
  if (s.includes('LAP')) return null
  const num = Number.parseFloat(s)
  return Number.isNaN(num) ? null : num
}

export default useF1Store
