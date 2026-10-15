import { useEffect, useState } from 'react'

import { apiBase } from '../utils/apiBase'

/**
 * Whether live timing is available on THIS deployment.
 *
 * The browser's WebSocket connecting proves nothing about F1 data: that socket
 * is to our backend. F1's live timing answers 403 to most datacenter IP ranges,
 * so a hosted instance connects happily and then streams nothing — which looks
 * identical to "no session on right now" unless the backend says which it is.
 *
 * Polls slowly: the answer changes when a session starts or a host's status
 * changes, neither of which is a per-second concern.
 */
export function useLiveStatus({ pollMs = 60000 } = {}) {
  const [status, setStatus] = useState({
    availability: 'connecting',
    detail: null,
    loading: true,
  })

  useEffect(() => {
    let cancelled = false
    const ctrl = new AbortController()

    const check = async () => {
      try {
        const res = await fetch(`${apiBase()}/api/live-status`, { signal: ctrl.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (!cancelled) {
          setStatus({
            availability: json.availability,
            detail: json.detail,
            signalr: json.signalr,
            loading: false,
          })
        }
      } catch (e) {
        if (cancelled || e.name === 'AbortError') return
        // The backend itself is unreachable — distinct from the feed being
        // blocked, and the UI says so differently.
        setStatus({ availability: 'backend_unreachable', detail: null, loading: false })
      }
    }

    check()
    const id = setInterval(check, pollMs)
    return () => { cancelled = true; ctrl.abort(); clearInterval(id) }
  }, [pollMs])

  return status
}

export default useLiveStatus
