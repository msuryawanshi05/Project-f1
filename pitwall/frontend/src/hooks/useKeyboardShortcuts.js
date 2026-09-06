import { useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import useF1Store from '../store/useF1Store'

/**
 * useKeyboardShortcuts — global keyboard shortcut handler.
 * Works from anywhere in the app without focusing a specific element.
 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate()
  const settings = useF1Store((s) => s.settings)
  const updateSettings = useF1Store((s) => s.updateSettings)

  const handler = useCallback((e) => {
    // Ignore shortcuts when user is typing in a form element
    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    if (e.ctrlKey || e.metaKey || e.altKey) return

    switch (e.key) {
      // ── Navigation ──────────────────────────────────────────────────────────
      case '1': navigate('/');           break
      case '2': navigate('/live');       break
      case '3': navigate('/season');     break
      case '4': navigate('/standings');  break
      case '5': navigate('/results');    break
      case '6': navigate('/settings');   break

      // ── Live sub-tabs ────────────────────────────────────────────────────────
      case 't':
      case 'T':
        if (window.location.pathname === '/live') window.__pitwall_setTab?.('TOWER')
        break
      case 's':
      case 'S':
        if (window.location.pathname === '/live') window.__pitwall_setTab?.('STRATEGY')
        break
      case 'e':
      case 'E':
        if (window.location.pathname === '/live') window.__pitwall_setTab?.('TELEMETRY')
        break
      case 'r':
      case 'R':
        if (window.location.pathname === '/live') window.__pitwall_setTab?.('RADIO')
        break

      // ── Settings toggles ─────────────────────────────────────────────────────
      case 'd':
      case 'D':
        updateSettings({ darkMode: !settings.darkMode })
        break
      case 'm':
      case 'M':
        updateSettings({ soundEnabled: !settings.soundEnabled })
        break

      // ── UI ───────────────────────────────────────────────────────────────────
      case 'Escape':
        window.__pitwall_closePanel?.()
        break
      case '?':
        window.__pitwall_openShortcuts?.()
        break
      case 'f':
      case 'F':
        window.__pitwall_toggleFullscreen?.()
        break

      default:
        break
    }
  }, [navigate, settings, updateSettings])

  useEffect(() => {
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handler])
}
