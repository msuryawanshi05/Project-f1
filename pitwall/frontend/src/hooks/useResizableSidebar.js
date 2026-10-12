import { useCallback, useEffect, useRef, useState } from 'react'
import useF1Store from '../store/useF1Store'
import { SIDEBAR } from '../utils/layoutConstants'

/**
 * useResizableSidebar — drag-to-resize for the Live page sidebar.
 *
 * The split was fixed at 58/42 percent, which breaks at both ends: on a 1200px
 * screen the tower got 696px against a 744px minimum and overflowed its pane,
 * while on an ultrawide the sidebar grew to 800px of mostly empty space.
 *
 * Width is stored in PIXELS, not a percentage, because what has to fit is
 * measured in pixels — the tower's column minimums do not scale with the
 * viewport. The upper bound is therefore computed per render from the
 * container width minus the tower minimum, so the tower can never be squeezed
 * below the width its columns need.
 *
 * Persisted through the settings store, which already writes to localStorage.
 */
export function useResizableSidebar({ containerRef, towerMinWidth, enabled = true }) {
  const stored = useF1Store((s) => s.settings.liveSidebarWidth)
  const updateSettings = useF1Store((s) => s.updateSettings)

  const [width, setWidth] = useState(() => stored ?? SIDEBAR.default)
  const [dragging, setDragging] = useState(false)
  const frame = useRef(null)
  const latest = useRef(width)

  const clamp = useCallback((w) => {
    const container = containerRef.current?.getBoundingClientRect().width ?? 0
    // Never let the sidebar push the tower below its column minimum.
    const roomForSidebar = container > 0
      ? container - towerMinWidth - SIDEBAR.handle
      : SIDEBAR.max
    const upper = Math.max(SIDEBAR.min, Math.min(SIDEBAR.max, roomForSidebar))
    return Math.round(Math.max(SIDEBAR.min, Math.min(upper, w)))
  }, [containerRef, towerMinWidth])

  // Re-clamp when the window or the tower's minimum changes, so an existing
  // stored width cannot strand the tower in an overflowing state.
  useEffect(() => {
    if (!enabled) return
    const apply = () => setWidth((w) => clamp(w))
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
  }, [enabled, clamp])

  const onPointerDown = useCallback((e) => {
    if (!enabled) return
    e.preventDefault()
    const startX = e.clientX
    const startW = latest.current
    setDragging(true)
    e.currentTarget.setPointerCapture?.(e.pointerId)

    const move = (ev) => {
      // Dragging left grows the sidebar: the handle sits on its inner edge.
      const next = clamp(startW - (ev.clientX - startX))
      latest.current = next
      // Coalesce to one update per frame — pointermove fires far faster than
      // the tower can re-layout, and the tower must stay at 60fps.
      if (frame.current == null) {
        frame.current = requestAnimationFrame(() => {
          frame.current = null
          setWidth(latest.current)
        })
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (frame.current != null) { cancelAnimationFrame(frame.current); frame.current = null }
      setDragging(false)
      setWidth(latest.current)
      updateSettings({ liveSidebarWidth: latest.current })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [enabled, clamp, updateSettings])

  // Keyboard resize: a drag handle that only works with a mouse is unusable
  // for anyone who cannot use one.
  const onKeyDown = useCallback((e) => {
    const step = e.shiftKey ? 48 : 16
    let next = null
    if (e.key === 'ArrowLeft') next = clamp(latest.current + step)
    if (e.key === 'ArrowRight') next = clamp(latest.current - step)
    if (e.key === 'Home') next = clamp(SIDEBAR.default)
    if (next == null) return
    e.preventDefault()
    latest.current = next
    setWidth(next)
    updateSettings({ liveSidebarWidth: next })
  }, [clamp, updateSettings])

  useEffect(() => { latest.current = width }, [width])

  // While dragging, keep the resize cursor and stop text selection everywhere.
  useEffect(() => {
    if (!dragging) return
    const prevCursor = document.body.style.cursor
    const prevSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevSelect
    }
  }, [dragging])

  return { width, dragging, onPointerDown, onKeyDown }
}

export default useResizableSidebar
