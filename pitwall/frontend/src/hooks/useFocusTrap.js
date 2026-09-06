import { useEffect, useRef } from 'react'

/**
 * useFocusTrap — traps keyboard focus inside a container when active.
 * Use for modals, drawers, and overlay panels.
 *
 * @param {boolean} isActive - When true, focus is trapped inside containerRef
 * @returns {React.RefObject} containerRef — attach to the modal container element
 */
export function useFocusTrap(isActive) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!isActive || !containerRef.current) return

    const container = containerRef.current
    const focusableSelectors = [
      'button:not([disabled])',
      '[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ')

    const focusableElements = container.querySelectorAll(focusableSelectors)
    const first = focusableElements[0]
    const last  = focusableElements[focusableElements.length - 1]

    // Focus the first element when trap activates
    const previouslyFocused = document.activeElement
    first?.focus()

    function onKeyDown(e) {
      if (e.key !== 'Tab') return

      if (e.shiftKey) {
        // Shift+Tab: wrap from first → last
        if (document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        }
      } else {
        // Tab: wrap from last → first
        if (document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // Restore focus to the element that was focused before the trap activated
      previouslyFocused?.focus()
    }
  }, [isActive])

  return containerRef
}
