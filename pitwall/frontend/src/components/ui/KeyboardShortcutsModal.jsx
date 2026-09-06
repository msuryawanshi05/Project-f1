import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useFocusTrap } from '../../hooks/useFocusTrap'

const SHORTCUTS = [
  {
    group: 'Navigation',
    items: [
      { key: '1', label: 'Go to Home' },
      { key: '2', label: 'Go to Live Dashboard' },
      { key: '3', label: 'Go to Season Calendar' },
      { key: '4', label: 'Go to Standings' },
      { key: '5', label: 'Go to Results' },
      { key: '6', label: 'Go to Settings' },
    ],
  },
  {
    group: 'Live Page Tabs',
    items: [
      { key: 'T', label: 'Tower — Timing tower' },
      { key: 'S', label: 'Strategy — Stint & gap charts' },
      { key: 'E', label: 'Telemetry — Car data' },
      { key: 'R', label: 'Radio — Team transmissions' },
    ],
  },
  {
    group: 'Toggles',
    items: [
      { key: 'D', label: 'Toggle dark / light mode' },
      { key: 'M', label: 'Toggle sound on / off' },
      { key: 'F', label: 'Toggle fullscreen' },
    ],
  },
  {
    group: 'General',
    items: [
      { key: '?', label: 'Show this keyboard shortcut guide' },
      { key: 'Esc', label: 'Close open panel or modal' },
    ],
  },
]

/**
 * KeyboardShortcutsModal — shows all keyboard shortcuts in a centered modal.
 * Opens on '?' keypress (via window.__pitwall_openShortcuts).
 * Closes on Escape or backdrop click.
 */
export default function KeyboardShortcutsModal({ isOpen, onClose }) {
  const trapRef = useFocusTrap(isOpen)

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="shortcuts-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[99998] bg-black/70 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal panel */}
          <motion.div
            key="shortcuts-modal"
            ref={trapRef}
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed inset-0 z-[99999] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="pointer-events-auto w-full max-w-xl bg-pitwall-surface border border-pitwall-border rounded-sm shadow-2xl overflow-hidden"
              style={{ background: 'var(--pw-surface)' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-pitwall-border bg-pitwall-surface-2">
                <div className="flex items-center gap-2">
                  <span className="font-display font-black text-sm tracking-widest uppercase text-pitwall-text-strong">
                    Keyboard Shortcuts
                  </span>
                  <span className="font-mono text-[9px] text-pitwall-ghost border border-pitwall-border px-1.5 py-0.5 rounded-sm">PITWALL</span>
                </div>
                <button
                  onClick={onClose}
                  className="text-pitwall-ghost hover:text-pitwall-text-strong transition-colors text-sm font-mono px-1.5 py-0.5 rounded border border-transparent hover:border-pitwall-border"
                  aria-label="Close keyboard shortcuts"
                >
                  ✕
                </button>
              </div>

              {/* Shortcut groups */}
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-5 overflow-y-auto max-h-[70vh]">
                {SHORTCUTS.map(({ group, items }) => (
                  <div key={group}>
                    <div className="font-display text-[9px] font-bold tracking-widest uppercase text-pitwall-ghost mb-2.5 border-b border-pitwall-border pb-1.5">
                      {group}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {items.map(({ key, label }) => (
                        <div key={key} className="flex items-center gap-3">
                          <kbd className="px-2 py-0.5 text-xs font-mono rounded-sm border border-pitwall-border bg-pitwall-surface-2 text-pitwall-text-strong min-w-[28px] text-center flex-shrink-0 shadow-sm">
                            {key}
                          </kbd>
                          <span className="font-body text-xs text-pitwall-dim">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer hint */}
              <div className="px-5 py-2.5 border-t border-pitwall-border bg-pitwall-surface-2/40">
                <p className="font-mono text-[9px] text-pitwall-ghost">
                  Shortcuts are disabled when typing in input fields.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
