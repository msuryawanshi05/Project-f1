import { useOpenF1CarData } from './useOpenF1'

/**
 * useCarData — PITWALL
 *
 * LIVE telemetry (speed, rpm, gear, throttle, brake, hybrid deployment) comes
 * from the F1 SignalR feed via the backend WebSocket and lands in
 * useF1Store.carData / carDataHistory. Read it from the store for live views.
 *
 * This hook covers the POST-SESSION case only, where SignalR is no longer
 * streaming: it pulls a single driver's car_data for one lap from OpenF1.
 * OpenF1's historical endpoints are free and need no key (verified 2026-10-11);
 * an earlier revision stubbed this out believing they returned 401.
 *
 * `sessionKey` must be a real OpenF1 session key (store.currentSessionKey),
 * not a Jolpica round number.
 */
export function useCarData(driverNumber, sessionKey = null, isLive = false) {
  // Live sessions are served by SignalR via the store — don't double-fetch.
  const { data, loading } = useOpenF1CarData(
    isLive ? null : sessionKey,
    isLive ? null : driverNumber,
    null,
  )
  return { data, loading }
}
