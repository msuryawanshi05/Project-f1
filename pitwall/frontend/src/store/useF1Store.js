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
  density: 'comfortable',
  teamAccent: '#E10600',
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
  carDataHistory: {}, // { [driverNumber]: [{ speed, rpm, gear, throttle, brake, drs, ... }] }

  // ── Strategy chart gap history ──────────────────────────────────────────────
  gapHistory: [],     // [{ lap, gap_<number>: seconds, ... }] — last 100 laps
  // ── Telemetry driver selection ──────────────────────────────────────────────
  selectedTelemetryDriver: null,
  compareTelemetryDriver: null,
  // ── Radio playback ──────────────────────────────────────────────────────────
  playingRadioId: null,
  // ── Phase 6: Session key (from OpenF1) ──────────────────────────────────────
  currentSessionKey: null,
  // ── Phase 6: Per-driver best lap times (for qualifying mode) ────────────────
  bestLaps: {},       // { [driverNumber]: bestLapSeconds }

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
    set((state) => {
      const msgKey = `${message.time}_${message.message}`
      if (state.raceControl.some((m) => `${m.time}_${m.message}` === msgKey)) {
        return state
      }
      return {
        raceControl: [message, ...state.raceControl].slice(0, 50),
      }
    }),

  setCarData: (driverNumber, data) =>
    set((state) => {
      const hist = state.carDataHistory[driverNumber] ?? []
      const newHist = [...hist, data].slice(-300)
      return {
        carData: { ...state.carData, [driverNumber]: data },
        carDataHistory: { ...state.carDataHistory, [driverNumber]: newHist },
      }
    }),

  addNotification: (notification) =>
    set((state) => {
      // Deduplicate: retirement notifications can only be added once per driver
      if (notification.event === 'retirement' && notification.driverNumber) {
        const hasExisting = state.notifications.some(
          (n) => n.event === 'retirement' && String(n.driverNumber) === String(notification.driverNumber)
        )
        if (hasExisting) return state
      }

      // Deduplicate: race_start only once
      if (notification.event === 'race_start') {
        const hasExisting = state.notifications.some((n) => n.event === 'race_start')
        if (hasExisting) return state
      }

      // General dedup: don't add the exact same title & message if present in last 10 seconds
      const isDuplicate = state.notifications.some(
        (n) => n.title === notification.title && n.message === notification.message && (Date.now() - new Date(n.timestamp).getTime() < 10000)
      )
      if (isDuplicate) return state

      let filtered = state.notifications
      // If adding a pit stop notification for a driver, remove older pit stop cards for this driver
      if (notification.event === 'pit_stop' && notification.driverNumber) {
        filtered = filtered.filter(
          (n) => !(n.event === 'pit_stop' && String(n.driverNumber) === String(notification.driverNumber))
        )
      }
      // If adding a retirement notification, remove any pit stop notifications for that driver
      if (notification.event === 'retirement' && notification.driverNumber) {
        filtered = filtered.filter(
          (n) => !(n.event === 'pit_stop' && String(n.driverNumber) === String(notification.driverNumber))
        )
      }
      return {
        notifications: [
          {
            id: notification.id ?? Date.now(),
            type: notification.type,
            event: notification.event,
            title: notification.title,
            message: notification.message,
            live: notification.live ?? false,
            driverNumber: notification.driverNumber ?? null,
            timestamp: new Date().toISOString(),
            dismissed: false,
          },
          ...filtered.slice(0, 9),
        ],
      }
    }),

  // Patch an existing notification (e.g. pit-stop exit updating live timer)
  updateNotification: (id, updates) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, ...updates } : n
      ),
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
      const history = state.gapHistory
      const lastIndex = history.findIndex((h) => h.lap === currentLap)
      let next
      if (lastIndex !== -1) {
        next = [...history]
        next[lastIndex] = { ...next[lastIndex], ...entry }
      } else {
        next = [...history, entry]
      }
      return { gapHistory: next.slice(-100) }
    }),

  // ── Phase 5c: Telemetry driver selection ────────────────────────────────────
  setSelectedTelemetryDriver: (driverNumber) =>
    set({ selectedTelemetryDriver: driverNumber }),

  setCompareTelemetryDriver: (driverNumber) =>
    set({ compareTelemetryDriver: driverNumber }),

  // ── Phase 5c: Radio playback ────────────────────────────────────────────────
  setPlayingRadioId: (id) => set({ playingRadioId: id }),

  // ── Phase 6: Session key ────────────────────────────────────────────────────
  setCurrentSessionKey: (key) => set({ currentSessionKey: key }),

  pitStops: [],
  addPitStop: (stop) =>
    set((state) => {
      const exists = state.pitStops.some(
        (s) => String(s.driver_number) === String(stop.driver_number) && s.stop_number === stop.stop_number
      )
      if (exists) return {}
      return { pitStops: [stop, ...state.pitStops].slice(0, 100) }
    }),

  // ── Phase 6: Best lap accumulation (qualifying mode) ────────────────────────
  updateBestLap: (driverNumber, lapSeconds) =>
    set((state) => ({
      bestLaps: {
        ...state.bestLaps,
        [driverNumber]: Math.min(
          state.bestLaps[driverNumber] ?? Infinity,
          lapSeconds
        ),
      },
    })),
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
