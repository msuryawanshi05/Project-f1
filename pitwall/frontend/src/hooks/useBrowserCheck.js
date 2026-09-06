import { useState, useEffect } from 'react'

/**
 * useBrowserCheck — checks for critical browser API availability at startup.
 * Returns an array of missing feature descriptions (empty = all good).
 */
export function useBrowserCheck() {
  const [issues, setIssues] = useState([])

  useEffect(() => {
    const found = []
    if (!window.WebSocket) {
      found.push('WebSocket (required for live timing data)')
    }
    if (!window.AudioContext && !window.webkitAudioContext) {
      found.push('Web Audio API (required for notification sounds)')
    }
    if (!window.localStorage) {
      found.push('localStorage (required for settings persistence)')
    }
    if (!('IntersectionObserver' in window)) {
      found.push('IntersectionObserver (required for scroll animations)')
    }
    setIssues(found)
  }, [])

  return issues
}
