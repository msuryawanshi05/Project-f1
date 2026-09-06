import { AnimatePresence, motion } from 'framer-motion'

/**
 * PWAInstallBanner — subtle bottom banner shown after 3 visits.
 * Lets user install PITWALL as a PWA ("Add to Home Screen").
 */
export default function PWAInstallBanner({ showBanner, onInstall, onDismiss }) {
  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          key="pwa-banner"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          className="fixed bottom-8 left-4 right-4 md:left-auto md:right-4 md:w-80 z-[9990] shadow-xl"
          role="status"
          aria-live="polite"
          aria-label="Install PITWALL app"
        >
          <div
            className="flex items-center gap-3 p-3.5 rounded-sm border border-pitwall-border"
            style={{ background: 'var(--pw-surface)' }}
          >
            {/* Icon */}
            <div className="flex-shrink-0 w-8 h-8 rounded-sm bg-status-red/10 border border-status-red/20 flex items-center justify-center">
              <span className="font-display font-black text-[10px] text-status-red tracking-widest">PW</span>
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <div className="font-display font-bold text-xs text-pitwall-text-strong tracking-wider">
                Install PITWALL
              </div>
              <div className="font-body text-[10px] text-pitwall-dim mt-0.5 truncate">
                Add to desktop for race weekends
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={onInstall}
                className="px-3 py-1.5 bg-status-red text-white text-[10px] font-display font-bold tracking-wider rounded-sm transition-opacity hover:opacity-90 active:scale-[0.97]"
              >
                INSTALL
              </button>
              <button
                onClick={onDismiss}
                className="text-pitwall-ghost hover:text-pitwall-dim transition-colors font-mono text-xs px-1"
                aria-label="Dismiss install prompt"
              >
                ✕
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
