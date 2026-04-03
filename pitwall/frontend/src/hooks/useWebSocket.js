import { useEffect, useRef, useState } from 'react'
import useF1Store from '../store/useF1Store'

const WS_URL              = import.meta.env.VITE_WS_URL  ?? 'ws://localhost:8000/ws'
const API_BASE            = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const RECONNECT_DELAY_MS  = 3000

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
  const wsRef             = useRef(null)
  const reconnectTimerRef = useRef(null)
  const connectedRef      = useRef(false)  // sync ref for visibility handler

  const {
    setSession,
    setTrackStatus,
    setDrivers,
    setTiming,
    setTyres,
    setWeather,
    addRaceControl,
    setCurrentSessionKey,
    updateBestLap,
  } = useF1Store()

  // ── Route a parsed message into the store ─────────────────────────────────
  function routeMessageToStore(msg) {
    const { type, data } = msg

    // Track topics for DataMonitor
    devMonitor.topicsSeen.add(type)
    devMonitor.lastType = type
    devMonitor.lastTs   = new Date().toLocaleTimeString()

    switch (type) {
      case 'session':
        setSession(data)
        break
      case 'track_status':
        setTrackStatus(data)
        break
      case 'driver_list':
        setDrivers(data.drivers ?? [])
        break
      case 'timing': {
        const drivers = data.drivers ?? []
        setTiming(drivers)
        // Accumulate best laps for qualifying mode
        drivers.forEach((d) => {
          if (d.last_lap) {
            const secs = lapTimeToSeconds(d.last_lap)
            if (secs && !d.deleted_lap) updateBestLap(d.number, secs)
          }
        })
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
      case 'lap_count':
        setSession({ ...useF1Store.getState().session, ...data })
        break
      default:
        console.debug('[WS] Unhandled message type:', type)
    }
  }

  // ── Fetch current session key from backend ────────────────────────────────
  async function fetchCurrentSession() {
    try {
      const res = await fetch(`${API_BASE}/api/current-session`)
      if (res.ok) {
        const json = await res.json()
        if (json.session_key) {
          setCurrentSessionKey(json.session_key)
          console.debug('[WS] Current session key:', json.session_key)
        }
      }
    } catch (e) {
      console.debug('[WS] Could not fetch current session:', e.message)
    }
  }

  // ── Connect / reconnect ──────────────────────────────────────────────────
  const connect = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      connectedRef.current = true
      console.debug('[WS] Connected to', WS_URL)
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      // Fetch current session key after connecting
      fetchCurrentSession()
    }

    ws.onmessage = (event) => {
      _msgCount++

      let msg
      try {
        msg = JSON.parse(event.data)
      } catch (e) {
        console.warn('[WS] Failed to parse message:', e)
        return
      }

      // Handle ping — respond with pong (backend doesn't require it, but good practice)
      if (msg.type === 'ping') {
        try { ws.send(JSON.stringify({ type: 'pong' })) } catch (sendErr) { console.debug('[WS] pong failed', sendErr) }
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
      console.debug('[WS] Disconnected — reconnecting in', RECONNECT_DELAY_MS, 'ms')
      reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS)
    }

    ws.onerror = (err) => {
      const errMsg = `WS error at ${new Date().toLocaleTimeString()}`
      devMonitor.recentErrors = [errMsg, ...devMonitor.recentErrors].slice(0, 5)
      console.warn('[WS] Error:', err)
      ws.close()
    }
  }

  useEffect(() => {
    connect()

    // ── Visibility change: reconnect immediately when tab regains focus ──────
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        wsRef.current?.readyState !== WebSocket.OPEN
      ) {
        console.debug('[WS] Tab visible — reconnecting')
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

  return { connected }
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
