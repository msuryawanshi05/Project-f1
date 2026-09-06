import { useEffect } from 'react'
import useF1Store from '../store/useF1Store'

export function useDynamicTitle() {
  const session = useF1Store((s) => s.session)
  const trackStatus = useF1Store((s) => s.trackStatus)
  const timing = useF1Store((s) => s.timing)
  const drivers = useF1Store((s) => s.drivers)

  useEffect(() => {
    // Find leader code
    const leaderRow = timing.find((t) => String(t.position) === '1')
    const leaderNum = leaderRow?.driver_number ?? leaderRow?.number
    const leaderDriver = drivers.find((d) => String(d.number) === String(leaderNum))
    const leaderCode = leaderDriver?.short_name ?? leaderDriver?.code ?? ''

    // Update document title
    if (session.name && leaderCode) {
      const lap = session.lap ? `Lap ${session.lap}` : session.phase ?? 'LIVE'
      document.title = `P1 ${leaderCode} | ${lap} | PITWALL`
    } else if (session.name) {
      document.title = `${session.name} | PITWALL`
    } else {
      document.title = 'PITWALL · Live Racing Timing Cockpit'
    }

    // Determine status color
    // '1' = Green, '2' = Yellow, '4' = SC, '5' = Red, '6' = VSC
    const status = String(trackStatus?.status ?? '')
    let statusColor = '#E10600' // Default F1 red
    if (status === '1') {
      statusColor = '#00D2BE' // Green flag teal
    } else if (['2', '4', '6'].includes(status)) {
      statusColor = '#FFF200' // Yellow flag
    } else if (status === '5') {
      statusColor = '#E8002D' // Red flag
    }

    // Update favicon
    try {
      let link = document.querySelector("link[rel~='icon']")
      if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.getElementsByTagName('head')[0].appendChild(link)
      }
      const canvas = document.createElement('canvas')
      canvas.width = 32
      canvas.height = 32
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, 32, 32)
        ctx.fillStyle = statusColor
        ctx.beginPath()
        ctx.arc(16, 16, 14, 0, 2 * Math.PI)
        ctx.fill()
        
        ctx.strokeStyle = '#000000'
        ctx.lineWidth = 3
        ctx.stroke()
        
        link.href = canvas.toDataURL()
      }
    } catch (e) {
      console.warn('Failed to update favicon:', e)
    }
  }, [session, trackStatus, timing, drivers])
}
