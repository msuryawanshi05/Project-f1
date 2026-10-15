import { useEffect, useRef, useState } from 'react'
import useF1Store from '../store/useF1Store'

const WS_URL              = import.meta.env.VITE_WS_URL  ?? 'ws://localhost:8000/ws'
const API_BASE            = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
// Reconnect backoff.
//
// A fixed 3s retry is wrong for a free-tier host: Render spins containers down
// after inactivity and a cold start takes roughly 30-60 seconds, during which
// every attempt fails. Hammering it does not help and the UI just reads as
// broken. Backing off while REPORTING that we are still trying is the
// difference between "waking the server" and "offline".
const RECONNECT_BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000]

// ── Never-delay message types (safety/meta) ──────────────────────────────────
const NO_DELAY_TYPES = new Set(['session', 'track_status', 'ping', 'lap_count', 'driver_list'])

// ── Dev monitoring state (exported for DataMonitor) ──────────────────────────
export const devMonitor = {
  msgRate:      0,     // messages/sec
  lastType:     '',
  lastTs:       '',
  topicsSeen:   new Set(),
  recentErrors: [],    // last 5 errors
}

// Internal msg/sec counter
let _msgCount = 0
setInterval(() => {
  devMonitor.msgRate = _msgCount
  _msgCount = 0
}, 1000)

// ── car_data batch buffer ─────────────────────────────────────────────────────
let _carDataBuffer = {}
setInterval(() => {
  const entries = Object.entries(_carDataBuffer)
  if (entries.length > 0) {
    const store = useF1Store.getState()
    entries.forEach(([num, data]) => store.setCarData(Number(num), data))
    _carDataBuffer = {}
  }
}, 500)


export function useWebSocket() {
  const [connected, setConnected] = useState(false)
  // 'connecting' is a real state, not a transient: on a cold-started backend it
  // is where the app lives for the better part of a minute.
  const [connectionState, setConnectionState] = useState('connecting')
  const [attempts, setAttempts] = useState(0)
  const wsRef             = useRef(null)
  const reconnectTimerRef = useRef(null)
  const connectedRef      = useRef(false)  // sync ref for visibility handler
  const attemptsRef       = useRef(0)

  const {
    setSession,
    setTrackStatus,
    setDrivers,
    setTiming,
    setTyres,
    setWeather,
    addRaceControl,
    setCurrentSessionKey,
    setCurrentRound,
    setSessionMeta,
    setQualifying,
    updateBestLap,
    updateGapHistory,
    resetLiveSession,
    setReplay,
    setSendCommand,
  } = useF1Store()

  // ── Race-control freshness ───────────────────────────────────────────────────
// A "FORMATION LAP" / "START PROCEDURE" line means the session is starting only
// if it is RECENT. These scans used to cover all 50 retained messages with no
// time bound, so an hour-old formation-lap message kept forcing phase to LIVE —
// overwriting the backend's correct FINISHED and leaving a completed race
// advertised as live timing. This is the same defect already fixed in
// StatusBar, BroadcastBanner and useRaceWeekendState; this copy was the one
// that corrupted the phase at its source.
const RC_FRESH_MS = 10 * 60 * 1000

function hasRecentStartProcedure(messages) {
  const cutoff = Date.now() - RC_FRESH_MS
  return messages.some((m) => {
    const ts = m.time ? Date.parse(m.time) : NaN
    if (!Number.isFinite(ts) || ts < cutoff) return false
    const t = (m.message || m.msg || '').toUpperCase()
    return t.includes('FORMATION LAP') || t.includes('START PROCEDURE')
  })
}

// ── Route a parsed message into the store ─────────────────────────────────
  function routeMessageToStore(msg) {
    const { type, data } = msg

    // Track topics for DataMonitor
    devMonitor.topicsSeen.add(type)
    devMonitor.lastType = type
    devMonitor.lastTs   = new Date().toLocaleTimeString()

    switch (type) {
      case 'session': {
        const cur = useF1Store.getState().session
        const raceControlMsgs = useF1Store.getState().raceControl
        // A finished session is never "starting". Without this guard a stale
        // formation-lap message outranked the backend's FINISHED phase.
        const isFinished = data.phase === 'FINISHED'
        const isFormationOrActive = !isFinished && hasRecentStartProcedure(raceControlMsgs)
        const isPre = data.phase === 'PRE' && !isFormationOrActive
        const incomingPhase = isFormationOrActive ? 'LIVE' : (data.phase || cur.phase)
        setSession({
          ...cur,
          ...data,
          name: isFormationOrActive && (!data.name || data.name === 'Unknown') ? 'FORMATION LAP' : (data.name || cur.name),
          // NEVER coalesce to 0. The backend always sends data.lap === null
          // (SessionInfo/SessionData carry no lap number — only LapCount does),
          // and cur.lap starts as null, so `data.lap ?? cur.lap ?? 0` evaluated
          // to a literal 0 and the header rendered "LAP 0/53" mid-race.
          // null means "unknown" and renders as an em dash.
          lap: isPre ? null : (data.lap ?? cur.lap ?? null),
          total_laps: data.total_laps ?? cur.total_laps,
          phase: incomingPhase,
        })
        // Secondary source for the qualifying segment: SessionData.Series[].
        // Used when a TimingData delta omits SessionPart.
        if (data.qualifying_part != null) {
          setQualifying({ part: data.qualifying_part })
        }
        if (isPre && cur.phase !== 'PRE') {
          resetLiveSession()
        }
        break
      }
      case 'track_status':
        setTrackStatus(data)
        break
      case 'driver_list':
        setDrivers(data.drivers ?? [])
        break
      case 'timing': {
        const drivers = data.drivers ?? []
        setTiming(drivers)

        // Qualifying segment + per-segment car counts ride on the TimingData
        // root alongside Lines. SessionPart is the authoritative Q1/Q2/Q3
        // signal; noEntries ([22, 15, 10] in 2026) gives the cut lines.
        if (data.session_part != null || data.no_entries != null) {
          const patch = {}
          if (data.session_part != null) patch.part = data.session_part
          if (Array.isArray(data.no_entries)) patch.noEntries = data.no_entries
          if (Object.keys(patch).length > 0) setQualifying(patch)
        }
        if (drivers.length > 0) {
          const cur = useF1Store.getState().session
          const hasLiveCars = drivers.some(d => d.pit_out || !d.in_pit || d.last_lap || d.gap_to_leader)
          if (hasLiveCars && cur.phase === 'PRE') {
            setSession({ ...cur, phase: 'LIVE' })
          }
        }
        // Lap-count fallback: LapCount is the authoritative source, but it can
        // arrive late or be missing in some session types. The race leader's
        // NumberOfLaps is equivalent, so use it until LapCount lands rather
        // than leaving the lap counter blank.
        {
          const sess = useF1Store.getState().session
          if (sess.lap == null && sess.phase !== 'PRE') {
            const leaderLap = drivers.reduce((max, d) => {
              const n = Number(d.lap)
              return Number.isFinite(n) && n > max ? n : max
            }, 0)
            if (leaderLap >= 1) setSession({ ...sess, lap: leaderLap })
          }
        }

        // Accumulate best laps. TimingData.BestLapTime is authoritative (F1
        // already excludes deleted laps from it); the last_lap path remains for
        // feeds that only send LastLapTime.
        drivers.forEach((d) => {
          if (d.best_lap_time_in_s != null) {
            updateBestLap(d.number, d.best_lap_time_in_s)
          } else if (d.last_lap && !d.deleted_lap) {
            const secs = lapTimeToSeconds(d.last_lap)
            if (secs) updateBestLap(d.number, secs)
          }
        })
        
        // Accumulate gap history (fallback to 1 if lap is null)
        const sessionState = useF1Store.getState().session
        const currentLap = sessionState.lap ?? 1
        updateGapHistory(drivers, currentLap)
        break
      }
      case 'tyres':
        setTyres(data.drivers ?? [])
        break
      case 'weather':
        setWeather(data)
        break
      case 'race_control':
        if (Array.isArray(data.messages)) {
          data.messages.forEach(addRaceControl)
          const hasFormation = hasRecentStartProcedure(data.messages)
          if (hasFormation) {
            const cur = useF1Store.getState().session
            // Once the session has finished, nothing in race control should
            // push it back to LIVE.
            if (cur.phase !== 'LIVE' && cur.phase !== 'FINISHED') {
              setSession({
                ...cur,
                name: cur.name && cur.name !== 'Unknown' ? cur.name : 'FORMATION LAP',
                phase: 'LIVE',
              })
            }
          }
        }
        break
      case 'car_data':
        // Batch into buffer — flushed every 500ms
        if (Array.isArray(data.entries)) {
          data.entries.forEach((entry) => {
            _carDataBuffer[entry.driver_number] = entry
          })
        }
        break
      case 'lap_count': {
        const curSession = useF1Store.getState().session
        // A lap count only ever PROMOTES a not-yet-started session to LIVE.
        //
        // This used to read `phase !== 'PRE'` and then force LIVE, so once the
        // race was over the retained "lap 62 of 62" message flipped FINISHED
        // straight back to LIVE on every reconnect — the cached envelopes are
        // replayed in arbitrary order, so this reliably won the race against
        // the correct session envelope. It is why a completed Grand Prix went
        // on being advertised as live timing.
        const shouldPromote = Boolean(data.current && data.current >= 1 && curSession.phase === 'PRE')
        setSession({
          ...curSession,
          lap: data.current ?? curSession.lap,
          total_laps: data.total || curSession.total_laps,
          phase: shouldPromote ? 'LIVE' : curSession.phase,
        })
        break
      }
      case 'replay_state': {
        // The backend sends a light update four times a second while playing
        // (position only) and a full one on every transport change, so this
        // merges rather than replaces.
        const patch = {
          active: data.active,
          position: data.position ?? 0,
          duration: data.duration ?? useF1Store.getState().replay.duration,
          speed: data.speed ?? useF1Store.getState().replay.speed,
          playing: Boolean(data.playing),
          virtualNow: data.virtual_now ?? null,
        }
        if ('weekend' in data) patch.weekend = data.weekend
        if ('weekend_name' in data) patch.weekendName = data.weekend_name
        if ('event_date' in data) patch.eventDate = data.event_date
        if ('session' in data) patch.session = data.session
        if ('session_label' in data) patch.sessionLabel = data.session_label
        if ('kind' in data) patch.kind = data.kind
        if ('total_laps' in data) patch.totalLaps = data.total_laps
        // Leaving replay returns the tab to whatever the live feed is doing, so
        // the retained timing from the replay must go with it.
        if (data.active === false) resetLiveSession()
        setReplay(patch)
        break
      }
      case 'replay_error':
        setReplay({ active: false })
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[replay]', data?.message)
        }
        break
      default:
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.debug('[WS] Unhandled message type:', type)
        }
    }
  }

  // ── Resolve the current OpenF1 session key + Jolpica round ────────────────
  // session_key is an OpenF1 key, not a round number. It changes with every
  // session in a weekend (FP1 -> FP2 -> ... -> Race), so this re-runs whenever
  // the live session name changes, not just once on connect.
  async function fetchCurrentSession() {
    try {
      const res = await fetch(`${API_BASE}/api/current-session`)
      if (!res.ok) return
      const json = await res.json()
      if (json.session_key != null) setCurrentSessionKey(json.session_key)
      if (json.round != null) setCurrentRound(json.round)
      setSessionMeta({
        dateStart: json.date_start ?? null,
        dateEnd: json.date_end ?? null,
        isLive: Boolean(json.is_live),
      })
    } catch (_e) {
      // Network error fetching session — non-critical, silent in production
    }
  }

  // ── Connect / reconnect ──────────────────────────────────────────────────
  const connect = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return

    setConnectionState((prev) => (prev === 'connected' ? prev : 'connecting'))
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      setConnectionState('connected')
      attemptsRef.current = 0
      setAttempts(0)
      connectedRef.current = true
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      // Fetch current session key after connecting
      fetchCurrentSession()
      // Replay commands ride this socket. Publishing the sender here rather
      // than opening a second connection is what keeps replay on the live path.
      setSendCommand((cmd) => {
        try {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(cmd))
        } catch { /* socket closed between check and send */ }
      })
    }

    ws.onmessage = (event) => {
      _msgCount++

      let msg
      try {
        msg = JSON.parse(event.data)
      } catch (_e) {
        return
      }

      // Handle ping — respond with pong (backend doesn't require it, but good practice)
      if (msg.type === 'ping') {
        try { ws.send(JSON.stringify({ type: 'pong' })) } catch (_sendErr) { /* ignore */ }
        return
      }

      // Apply sync delay for delay-able message types
      const delay = useF1Store.getState().settings.syncDelaySeconds * 1000
      if (delay > 0 && !NO_DELAY_TYPES.has(msg.type)) {
        setTimeout(() => routeMessageToStore(msg), delay)
      } else {
        routeMessageToStore(msg)
      }
    }

    ws.onclose = () => {
      setConnected(false)
      connectedRef.current = false
      const n = attemptsRef.current
      attemptsRef.current = n + 1
      setAttempts(n + 1)
      setConnectionState('connecting')
      const delay = RECONNECT_BACKOFF_MS[Math.min(n, RECONNECT_BACKOFF_MS.length - 1)]
      reconnectTimerRef.current = setTimeout(connect, delay)
    }

    ws.onerror = (err) => {
      const errMsg = `WS error at ${new Date().toLocaleTimeString()}`
      devMonitor.recentErrors = [errMsg, ...devMonitor.recentErrors].slice(0, 5)
      ws.close()
    }
  }

  // Re-resolve the OpenF1 session key whenever the live session rolls over
  // (FP1 -> FP2 -> Qualifying -> Race), so OpenF1-backed panels follow along.
  const sessionName = useF1Store((s) => s.session.name)
  useEffect(() => {
    if (!sessionName) return
    fetchCurrentSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionName])

  // A session ends while the page is open. Without a periodic re-resolve the
  // client keeps the pre-chequered schedule and never learns the race is over
  // — which is half of why a finished session stayed on screen. Five minutes
  // is well inside the 30-minute provisional window.
  useEffect(() => {
    const id = setInterval(fetchCurrentSession, 5 * 60 * 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    connect()

    // ── Visibility change: reconnect immediately when tab regains focus ──────
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        wsRef.current?.readyState !== WebSocket.OPEN
      ) {
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current)
          reconnectTimerRef.current = null
        }
        connect()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (wsRef.current) wsRef.current.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { connected, connectionState, attempts }
}

// ── Helper: "1:23.456" → seconds ────────────────────────────────────────────
function lapTimeToSeconds(str) {
  if (!str) return null
  const _re = /^(\d+):(\d+\.\d+)$/
  const m = _re.exec(String(str))
  if (m) return Number(m[1]) * 60 + Number(m[2])
  const n = Number.parseFloat(str)
  return Number.isNaN(n) ? null : n
}
