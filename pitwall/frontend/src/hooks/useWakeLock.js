import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Keep the screen on while a session is running.
 *
 * A timing dashboard on a second screen is watched, not touched, so the
 * machine dims and locks it halfway through a stint. This replaces the
 * `powercfg` instructions the README used to carry — a browser API that lasts
 * exactly as long as the session is better than a system setting the user has
 * to remember to put back.
 *
 * Three things the Screen Wake Lock API makes necessary:
 *
 *  - The lock is dropped by the browser whenever the tab is hidden, and it is
 *    NOT restored on return. Re-acquiring on visibilitychange is required, not
 *    defensive.
 *  - `request()` rejects if the document is not visible, or if the OS is in a
 *    power-saving mode that forbids it. That is a normal outcome, not an error
 *    worth surfacing.
 *  - Firefox and some mobile browsers do not implement it at all. Absent, the
 *    hook reports `supported: false` and the page says nothing.
 *
 * @param {boolean} active whether a session is running
 */
export function useWakeLock(active) {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator
  const [held, setHeld] = useState(false)
  const sentinelRef = useRef(null)

  const release = useCallback(async () => {
    const s = sentinelRef.current
    sentinelRef.current = null
    setHeld(false)
    if (s) {
      try { await s.release() } catch { /* already gone */ }
    }
  }, [])

  const acquire = useCallback(async () => {
    if (!supported || sentinelRef.current) return
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    try {
      const s = await navigator.wakeLock.request('screen')
      sentinelRef.current = s
      setHeld(true)
      // The browser drops the lock on its own terms — tab hidden, battery
      // saver, OS policy. Reflecting that is the only way the indicator can be
      // trusted.
      s.addEventListener('release', () => {
        sentinelRef.current = null
        setHeld(false)
      })
    } catch {
      // Refused. Nothing to report: the page simply does not keep the screen
      // awake, which is what it did before this existed.
      sentinelRef.current = null
      setHeld(false)
    }
  }, [supported])

  useEffect(() => {
    if (!supported) return undefined
    if (active) acquire()
    else release()

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && active) acquire()
      else if (document.visibilityState !== 'visible') {
        // The browser has already dropped it; clear our record so the
        // indicator does not claim a lock that is gone.
        sentinelRef.current = null
        setHeld(false)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      release()
    }
  }, [supported, active, acquire, release])

  return { supported, held }
}

export default useWakeLock
