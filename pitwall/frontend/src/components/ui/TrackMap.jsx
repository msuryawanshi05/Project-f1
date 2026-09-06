/**
 * TrackMap.jsx — PITWALL
 * Renders an F1 circuit layout from GeoJSON.
 * Transparent canvas bg that blends with page theme.
 * Stats shown as a clean row below the map.
 * Lap record shown as inline label + value (full width, readable).
 */

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { getCountryAbbreviation } from '../../utils/driverUtils'

// ── Canvas renderer ───────────────────────────────────────────────────────────
function renderCircuit(canvas, coordinates, W, H, progress = 1, circuitData = null) {
  if (!canvas || !coordinates?.length || !W || !H) return

  const dpr = window.devicePixelRatio || 1
  canvas.width  = W * dpr
  canvas.height = H * dpr

  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, W, H)

  const pts = Array.isArray(coordinates[0]) ? coordinates : coordinates.flat(Infinity)
  if (!pts.length) return

  const lngs = pts.map((p) => p[0])
  const lats  = pts.map((p) => p[1])
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)

  const pad  = 0.12
  const dLng = (maxLng - minLng) || 0.001
  const dLat = (maxLat - minLat) || 0.001

  const toX = (lng) => (((lng - minLng) / dLng) * (1 - 2 * pad) + pad) * W
  const toY = (lat) => ((1 - (lat - minLat) / dLat) * (1 - 2 * pad) + pad) * H

  // Calculate coordinates up to progress * pts.length
  const limit = Math.max(1, Math.floor(pts.length * progress))

  const L = pts.length
  const splits = circuitData?.sector_splits || [0.33, 0.66]
  const s1End = Math.floor(L * splits[0])
  const s2End = Math.floor(L * splits[1])

  const p1Start = 0
  const p1End = Math.min(limit - 1, s1End)

  const p2Start = s1End
  const p2End = Math.max(s1End, Math.min(limit - 1, s2End))

  const p3Start = s2End
  const p3End = Math.max(s2End, limit - 1)

  const drawSegment = (start, end, closeTo0 = false) => {
    if (start >= end) return false
    ctx.beginPath()
    ctx.moveTo(toX(pts[start][0]), toY(pts[start][1]))
    for (let i = start + 1; i <= end; i++) {
      ctx.lineTo(toX(pts[i][0]), toY(pts[i][1]))
    }
    if (closeTo0 && progress >= 1.0) {
      ctx.lineTo(toX(pts[0][0]), toY(pts[0][1]))
    }
    return true
  }

  // 1. Draw Background Track (Double-border black track rail)
  ctx.beginPath()
  ctx.moveTo(toX(pts[0][0]), toY(pts[0][1]))
  for (let i = 1; i < limit; i++) ctx.lineTo(toX(pts[i][0]), toY(pts[i][1]))
  if (progress >= 1.0) ctx.closePath()

  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // Outer subtle border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
  ctx.lineWidth   = 11
  ctx.stroke()

  // Inner black track core
  ctx.strokeStyle = '#09090b'
  ctx.lineWidth   = 8
  ctx.stroke()

  // 2. Draw Sector Glows (Neon style)
  // Sector 1
  if (drawSegment(p1Start, p1End)) {
    ctx.save()
    ctx.shadowColor = 'rgba(255, 46, 46, 0.4)'
    ctx.shadowBlur  = 10
    ctx.strokeStyle = 'rgba(255, 46, 46, 0.25)'
    ctx.lineWidth   = 5
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.stroke()
    ctx.restore()
  }
  // Sector 2
  if (drawSegment(p2Start, p2End)) {
    ctx.save()
    ctx.shadowColor = 'rgba(0, 180, 236, 0.4)'
    ctx.shadowBlur  = 10
    ctx.strokeStyle = 'rgba(0, 180, 236, 0.25)'
    ctx.lineWidth   = 5
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.stroke()
    ctx.restore()
  }
  // Sector 3
  if (drawSegment(p3Start, p3End, true)) {
    ctx.save()
    ctx.shadowColor = 'rgba(255, 210, 0, 0.35)'
    ctx.shadowBlur  = 10
    ctx.strokeStyle = 'rgba(255, 210, 0, 0.2)'
    ctx.lineWidth   = 5
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.stroke()
    ctx.restore()
  }

  // 3. Draw Sector Stripes
  // Sector 1: Red
  if (drawSegment(p1Start, p1End)) {
    ctx.strokeStyle = '#ff2e2e'
    ctx.lineWidth   = 2.5
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.stroke()
  }
  // Sector 2: Blue/Cyan
  if (drawSegment(p2Start, p2End)) {
    ctx.strokeStyle = '#00b4ec'
    ctx.lineWidth   = 2.5
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.stroke()
  }
  // Sector 3: Yellow
  if (drawSegment(p3Start, p3End, true)) {
    ctx.strokeStyle = '#ffd200'
    ctx.lineWidth   = 2.5
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.stroke()
  }

  // 4. Draw Straight Zones / Active Aero / DRS Zones (Green dotted parallel lines)
  let currentStraight = null
  const straightZones = []
  for (let i = 2; i < L - 2; i++) {
    const p0 = { x: toX(pts[i-2][0]), y: toY(pts[i-2][1]) }
    const p1 = { x: toX(pts[i][0]), y: toY(pts[i][1]) }
    const p2 = { x: toX(pts[i+2][0]), y: toY(pts[i+2][1]) }

    const dx1 = p1.x - p0.x, dy1 = p1.y - p0.y
    const dx2 = p2.x - p1.x, dy2 = p2.y - p1.y
    const len1 = Math.sqrt(dx1*dx1 + dy1*dy1) || 1
    const len2 = Math.sqrt(dx2*dx2 + dy2*dy2) || 1

    const dot = (dx1 * dx2 + dy1 * dy2) / (len1 * len2)
    const angleChange = Math.acos(Math.max(-1, Math.min(1, dot)))
    const isStraight = angleChange < 0.08

    if (isStraight) {
      if (!currentStraight) {
        currentStraight = { start: i, end: i }
      } else {
        currentStraight.end = i
      }
    } else {
      if (currentStraight) {
        if (currentStraight.end - currentStraight.start >= Math.max(10, Math.floor(L * 0.08))) {
          straightZones.push(currentStraight)
        }
        currentStraight = null
      }
    }
  }
  if (currentStraight && (currentStraight.end - currentStraight.start >= Math.max(10, Math.floor(L * 0.08)))) {
    straightZones.push(currentStraight)
  }

  straightZones.forEach((sz) => {
    ctx.beginPath()
    let first = true
    for (let i = sz.start; i <= sz.end; i++) {
      if (i >= limit) break
      
      const prevIdx = Math.max(0, i - 1)
      const nextIdx = Math.min(L - 1, i + 1)
      const dx = toX(pts[nextIdx][0]) - toX(pts[prevIdx][0])
      const dy = toY(pts[nextIdx][1]) - toY(pts[prevIdx][1])
      const len = Math.sqrt(dx*dx + dy*dy) || 1
      const tx = dx / len, ty = dy / len
      const nx = -ty, ny = tx // left normal

      const offset = 7.5
      const ox = toX(pts[i][0]) + nx * offset
      const oy = toY(pts[i][1]) + ny * offset

      if (first) {
        ctx.moveTo(ox, oy)
        first = false
      } else {
        ctx.lineTo(ox, oy)
      }
    }
    ctx.strokeStyle = '#00ff66' // bright green DRS / active aero
    ctx.lineWidth = 1.8
    ctx.setLineDash([2, 3])
    ctx.stroke()
    ctx.setLineDash([])
  })

  // 5. Draw Turn Numbers (Programmatic corner detection)
  const curvatures = []
  for (let i = 2; i < L - 2; i++) {
    const p0 = { x: toX(pts[i-2][0]), y: toY(pts[i-2][1]) }
    const p1 = { x: toX(pts[i][0]), y: toY(pts[i][1]) }
    const p2 = { x: toX(pts[i+2][0]), y: toY(pts[i+2][1]) }

    const dx1 = p1.x - p0.x, dy1 = p1.y - p0.y
    const dx2 = p2.x - p1.x, dy2 = p2.y - p1.y
    const len1 = Math.sqrt(dx1*dx1 + dy1*dy1) || 1
    const len2 = Math.sqrt(dx2*dx2 + dy2*dy2) || 1

    const dot = (dx1 * dx2 + dy1 * dy2) / (len1 * len2)
    const angleChange = Math.acos(Math.max(-1, Math.min(1, dot)))
    
    // cross product to find direction (positive = turn right, negative = turn left)
    const cross = dx1 * dy2 - dy1 * dx2
    
    curvatures.push({ index: i, val: angleChange, x: p1.x, y: p1.y, cross, dx1, dy1, dx2, dy2, len1, len2 })
  }

  const threshold = 0.15
  const minSpacing = 4
  const peaks = []

  for (let idx = 1; idx < curvatures.length - 1; idx++) {
    const prev = curvatures[idx - 1].val
    const curr = curvatures[idx].val
    const next = curvatures[idx + 1].val
    if (curr > prev && curr > next && curr > threshold) {
      peaks.push(curvatures[idx])
    }
  }

  // Filter & cluster peaks that are too close
  peaks.sort((a, b) => a.index - b.index)
  const detectedCorners = []
  for (const peak of peaks) {
    if (detectedCorners.length === 0) {
      detectedCorners.push(peak)
    } else {
      const last = detectedCorners[detectedCorners.length - 1]
      if (peak.index - last.index < minSpacing) {
        if (peak.val > last.val) {
          detectedCorners[detectedCorners.length - 1] = peak
        }
      } else {
        detectedCorners.push(peak)
      }
    }
  }

  // Draw detected corners
  detectedCorners.forEach((corner, index) => {
    if (corner.index >= limit) return

    const label = String(index + 1).padStart(2, '0')
    
    // Tangent at corner
    const u1x = corner.dx1 / corner.len1, u1y = corner.dy1 / corner.len1
    const u2x = corner.dx2 / corner.len2, u2y = corner.dy2 / corner.len2
    const tx = u1x + u2x, ty = u1y + u2y
    const tlen = Math.sqrt(tx*tx + ty*ty) || 1
    const utx = tx / tlen, uty = ty / tlen
    
    // Normal to left
    const unx = -uty, uny = utx
    
    // Offset outwards
    const sign = corner.cross > 0 ? 1 : -1
    const ox = unx * sign
    const oy = uny * sign
    
    const offset = 12
    const textX = corner.x + ox * offset
    const textY = corner.y + oy * offset

    ctx.save()
    ctx.font = 'bold 8px Courier, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    // Text outline
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 2.5
    ctx.strokeText(label, textX, textY)
    
    // Text fill
    ctx.fillStyle = '#ffffff'
    ctx.fillText(label, textX, textY)
    ctx.restore()
  })

  // 6. Checkered Start/Finish Line at pts[0]
  if (pts.length > 1) {
    const x0 = toX(pts[0][0])
    const y0 = toY(pts[0][1])
    const x1 = toX(pts[1][0])
    const y1 = toY(pts[1][1])

    const dx = x1 - x0
    const dy = y1 - y0
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const ux = dx / len
    const uy = dy / len

    const px = -uy
    const py = ux

    const lineHalfLength = 8

    ctx.beginPath()
    ctx.moveTo(x0 - px * lineHalfLength, y0 - py * lineHalfLength)
    ctx.lineTo(x0 + px * lineHalfLength, y0 + py * lineHalfLength)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 3
    ctx.lineCap = 'butt'
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(x0 - px * lineHalfLength, y0 - py * lineHalfLength)
    ctx.lineTo(x0 + px * lineHalfLength, y0 + py * lineHalfLength)
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 1.2
    ctx.setLineDash([2, 2])
    ctx.stroke()
    ctx.setLineDash([])
  }
}

// ── Stat item ─────────────────────────────────────────────────────────────────
function StatItem({ label, value }) {
  if (!value) return null
  return (
    <div className="flex flex-col items-center gap-0.5 flex-1">
      <span className="font-mono text-[10px] tracking-widest uppercase"
        style={{ color: 'var(--pw-ghost)' }}>{label}</span>
      <span className="font-mono text-sm font-semibold"
        style={{ color: 'var(--pw-text)' }}>{value}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TrackMap({ circuitData, compact = false, showStats = true }) {
  const canvasRef    = useRef(null)
  const containerRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [failed,  setFailed]  = useState(false)
  const [coords,  setCoords]  = useState(null)
  const [progress, setProgress] = useState(0)

  const slug = circuitData?.svg

  useEffect(() => {
    setLoading(true); setFailed(false); setCoords(null)
    if (!slug) { setFailed(true); setLoading(false); return }

    let cancelled = false
    fetch(`/trackmaps/${slug}.geojson`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((geo) => {
        if (cancelled) return
        let pts = null
        const features = geo.features ?? (geo.type === 'Feature' ? [geo] : [])
        for (const f of features) {
          const g = f.geometry; if (!g) continue
          if (g.type === 'LineString')      { pts = g.coordinates; break }
          if (g.type === 'Polygon')         { pts = g.coordinates[0]; break }
          if (g.type === 'MultiLineString') { pts = g.coordinates.flat(1); break }
        }
        if (!pts?.length) throw new Error('no coords')
        setCoords(pts); setLoading(false)
      })
      .catch(() => { if (!cancelled) { setFailed(true); setLoading(false) } })
    return () => { cancelled = true }
  }, [slug])

  // Reset progress and animate when coords change
  useEffect(() => {
    if (!coords) return
    setProgress(0)
    
    let startTime = null
    const duration = 1400 // 1.4 seconds
    let animId
    
    const easeInOutQuad = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp
      const elapsed = timestamp - startTime
      const p = Math.min(elapsed / duration, 1)
      setProgress(easeInOutQuad(p))
      if (p < 1) {
        animId = requestAnimationFrame(animate)
      }
    }
    
    animId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animId)
  }, [coords])

  const draw = useCallback(() => {
    if (!canvasRef.current || !coords || !containerRef.current) return
    const { offsetWidth: W, offsetHeight: H } = containerRef.current
    if (!W || !H) return
    renderCircuit(canvasRef.current, coords, W, H, progress, circuitData)
  }, [coords, progress, circuitData])

  useLayoutEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(() => { if (coords) draw() })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [coords, draw])

  const flag    = getCountryAbbreviation(circuitData?.country)
  const raceLen = circuitData
    ? ((circuitData.laps ?? 0) * (circuitData.length_km ?? 0)).toFixed(1)
    : null

  const mapH = compact ? 140 : 200

  return (
    <div className="w-full flex flex-col gap-0">

      {/* ── Canvas ─────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="w-full relative overflow-hidden rounded-sm"
        style={{
          height: mapH,
          background: 'transparent',
          border: '1px solid var(--pw-border)',
        }}
      >
        {!failed && !loading && coords ? (
          <canvas
            ref={canvasRef}
            style={{ display: 'block', width: '100%', height: '100%' }}
          />
        ) : loading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-12 h-12 rounded-full border border-pitwall-border animate-pulse"
              style={{ background: 'var(--pw-surface)' }} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center w-full h-full gap-3">
            <span className="font-mono font-bold text-sm bg-pitwall-surface border border-pitwall-border px-2 py-0.5 rounded-sm text-status-red">
              {flag}
            </span>
            <span className="font-display font-bold text-xs tracking-widest uppercase"
              style={{ color: 'var(--pw-text)' }}>
              {circuitData?.circuit ?? 'Track map unavailable'}
            </span>
          </div>
        )}

        {/* Circuit city name overlay */}
        {!failed && !loading && coords && (
          <div className="absolute bottom-1.5 left-2 font-mono text-[9px] tracking-widest uppercase"
            style={{ color: 'var(--pw-ghost)' }}>
            {circuitData?.city ?? ''}
          </div>
        )}
      </div>

      {/* ── Stats row ──────────────────────────────────────────── */}
      {showStats && circuitData && (
        <div
          className="flex items-center divide-x"
          style={{
            borderLeft: '1px solid var(--pw-border)',
            borderRight: '1px solid var(--pw-border)',
            borderBottom: '1px solid var(--pw-border)',
            divideColor: 'var(--pw-border)',
            background: 'var(--pw-surface)',
          }}
        >
          {[
            { label: 'Laps',   value: circuitData.laps },
            { label: 'Length', value: circuitData.length_km ? `${circuitData.length_km} km` : null },
            { label: 'Turns',  value: circuitData.turns ?? circuitData.corners ?? null },
            { label: 'Dist.',  value: raceLen ? `${raceLen} km` : null },
          ].map(({ label, value }) =>
            value != null ? (
              <div
                key={label}
                className="flex flex-col items-center gap-0.5 flex-1 py-2 px-1"
                style={{ borderRight: '1px solid var(--pw-border)' }}
              >
                <span className="font-mono text-[9px] tracking-widest uppercase"
                  style={{ color: 'var(--pw-ghost)' }}>{label}</span>
                <span className="font-mono text-sm font-bold"
                  style={{ color: 'var(--pw-text-strong)' }}>{value}</span>
              </div>
            ) : null
          )}
        </div>
      )}

      {/* ── Lap record ─────────────────────────────────────────── */}
      {showStats && circuitData?.lap_record && (
        <div
          className="flex items-center justify-between gap-4 px-3 py-2"
          style={{
            background: 'var(--pw-surface)',
            border: '1px solid var(--pw-border)',
            borderTop: 'none',
          }}
        >
          <span className="font-mono text-[9px] tracking-widest uppercase flex-shrink-0"
            style={{ color: 'var(--pw-ghost)' }}>
            Lap Record
          </span>
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-sm font-bold flex-shrink-0"
              style={{ color: '#e10600' }}>
              {circuitData.lap_record}
            </span>
            <span className="font-mono text-xs truncate"
              style={{ color: 'var(--pw-dim)' }}>
              {circuitData.lap_record_holder}
            </span>
            <span className="font-mono text-[10px] flex-shrink-0"
              style={{ color: 'var(--pw-ghost)' }}>
              ({circuitData.lap_record_year})
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
