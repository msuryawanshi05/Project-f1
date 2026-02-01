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

  // ── Notification queue (for Phase 7 popup system) ──────────────────────────
  notifications: [],

  // ── User settings (persisted to localStorage) ──────────────────────────────
  settings: loadSettings(),

  // ── REST API data (Jolpica + OpenF1) ───────────────────────────────────────
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
      notifications: [notification, ...state.notifications].slice(0, 10),
    })),

  updateSettings: (partial) => {
    const next = { ...get().settings, ...partial }
    try {
      localStorage.setItem('pitwall_settings', JSON.stringify(next))
    } catch (_) {}
    set({ settings: next })
  },

  setCalendar: (calendar) => set({ calendar }),

  setStandings: (drivers, constructors) =>
    set({ standings: { drivers, constructors } }),

  setResults: (round, data) =>
    set((state) => ({
      results: { ...state.results, [round]: data },
    })),
}))

export default useF1Store
