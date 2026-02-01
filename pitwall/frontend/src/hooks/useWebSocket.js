import { useEffect, useRef, useState } from 'react'
import useF1Store from '../store/useF1Store'

const WS_URL = 'ws://localhost:8000/ws'
const RECONNECT_DELAY_MS = 3000

export function useWebSocket() {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)

  const {
    setSession,
    setTrackStatus,
    setDrivers,
    setTiming,
    setTyres,
    setWeather,
    addRaceControl,
    setCarData,
  } = useF1Store()

  const connect = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      console.log('[WS] Connected to', WS_URL)
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }

    ws.onmessage = (event) => {
      let msg
      try {
        msg = JSON.parse(event.data)
      } catch (e) {
        console.warn('[WS] Failed to parse message:', e)
        return
      }

      const { type, data } = msg

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
        case 'timing':
          setTiming(data.drivers ?? [])
          break
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
          if (Array.isArray(data.entries)) {
            data.entries.forEach((entry) => {
              setCarData(entry.driver_number, entry)
            })
          }
          break
        case 'lap_count':
          // Merge into session state
          setSession({ ...useF1Store.getState().session, ...data })
          break
        case 'ping':
          break
        default:
          console.debug('[WS] Unhandled message type:', type)
      }
    }

    ws.onclose = () => {
      setConnected(false)
      console.log('[WS] Disconnected — reconnecting in', RECONNECT_DELAY_MS, 'ms')
      reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS)
    }

    ws.onerror = (err) => {
      console.warn('[WS] Error:', err)
      ws.close()
    }
  }

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (wsRef.current) wsRef.current.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { connected }
}
