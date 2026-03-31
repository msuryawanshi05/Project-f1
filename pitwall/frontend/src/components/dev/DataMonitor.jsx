import { useState, useEffect } from 'react'
import { devMonitor } from '../../hooks/useWebSocket'
import useF1Store from '../../store/useF1Store'

// Guard: only render in DEV, but define the component unconditionally
// so the import in AppShell always resolves to a valid component.
function DataMonitorInner() {
  const [visible, setVisible] = useState(false)
  const [_tick, setTick] = useState(0)   // force re-render every second

  // Re-render every second to show live counters
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Ctrl+Shift+D toggle
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        setVisible((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const timing      = useF1Store.getState().timing
  const raceControl = useF1Store.getState().raceControl
  const gapHistory  = useF1Store.getState().gapHistory
  const sessionKey  = useF1Store.getState().currentSessionKey

  if (!visible) {
    return (
      <div
        className="fixed bottom-4 left-4 z-[9999] font-mono text-[9px] text-[#333] cursor-pointer select-none"
        onClick={() => setVisible(true)}
        title="Ctrl+Shift+D to open DataMonitor"
      >
        ◉
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 left-4 z-[9999] w-72 bg-black/90 border border-[#222] font-mono text-[10px] text-[#888] select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 bg-[#111] border-b border-[#222]">
        <span className="text-[#E5E5E5] tracking-widest text-[9px]">DATA MONITOR</span>
        <div className="flex items-center gap-2">
          <span className="text-[#333] text-[9px]">Ctrl+Shift+D</span>
          <button
            onClick={() => setVisible(false)}
            className="text-[#555] hover:text-[#888] leading-none"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="p-2 space-y-2">
        {/* WS Status + rate */}
        <div className="flex items-center justify-between">
          <span className="text-[#555]">WS</span>
          <div className="flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{ backgroundColor: devMonitor.lastType ? '#00A651' : '#E8002D' }}
            />
            <span className="text-[#E5E5E5]">{devMonitor.msgRate} msg/s</span>
          </div>
        </div>

        {/* Last message */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[#555]">Last</span>
          <span className="text-[#E5E5E5] truncate">{devMonitor.lastType || '—'}</span>
          <span className="text-[#444] shrink-0">{devMonitor.lastTs || ''}</span>
        </div>

        {/* Store counters */}
        <div className="border-t border-[#1a1a1a] pt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          <span className="text-[#555]">timing</span>
          <span className="text-right">{timing.length} drivers</span>
          <span className="text-[#555]">raceCtrl</span>
          <span className="text-right">{raceControl.length} msgs</span>
          <span className="text-[#555]">gapHistory</span>
          <span className="text-right">{gapHistory.length} laps</span>
          <span className="text-[#555]">sessionKey</span>
          <span className="text-right text-[#E5E5E5]">{sessionKey ?? '—'}</span>
        </div>

        {/* Topics seen */}
        <div className="border-t border-[#1a1a1a] pt-2">
          <span className="text-[#555] text-[9px] uppercase tracking-widest block mb-1">Topics since connect</span>
          <div className="flex flex-wrap gap-1">
            {[...devMonitor.topicsSeen].map((t) => (
              <span key={t} className="px-1 bg-[#111] text-[#666] text-[9px]">{t}</span>
            ))}
            {devMonitor.topicsSeen.size === 0 && <span className="text-[#333]">none yet</span>}
          </div>
        </div>

        {/* Recent errors */}
        {devMonitor.recentErrors.length > 0 && (
          <div className="border-t border-[#1a1a1a] pt-2">
            <span className="text-[#E8002D] text-[9px] uppercase tracking-widest block mb-1">Errors</span>
            {devMonitor.recentErrors.map((e, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} className="text-[#E8002D] text-[9px] truncate">{e}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default DataMonitorInner
