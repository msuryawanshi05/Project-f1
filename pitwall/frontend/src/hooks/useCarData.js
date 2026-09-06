import { useState } from 'react'

/**
 * useCarData — PITWALL
 *
 * NOTE: OpenF1 now requires a paid subscription (401 for all requests as of mid-2026).
 * Live car telemetry (speed, rpm, gear, throttle, brake, drs) comes from
 * the F1 SignalR feed via the backend WebSocket (carData in useF1Store).
 *
 * This hook is kept as a no-op for compatibility — data comes from the store instead.
 */
export function useCarData(_driverNumber, _sessionKey = null, _isLive = false) {
  // OpenF1 unavailable — live telemetry comes from SignalR via useF1Store.carData
  return { data: [], loading: false }
}
