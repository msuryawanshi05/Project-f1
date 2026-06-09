/**
 * TrackMap.jsx
 * Renders an F1 circuit layout from GeoJSON (bacinger/f1-circuits format).
 * Falls back to a styled stats card if GeoJSON is unavailable.
 *
 * Props:
 *   circuitData  — entry from circuits.json (has .svg slug, .laps, .length_km etc.)
 *   compact      — smaller height (for sidebars / home page)
 *   showStats    — whether to show stat chips + lap record below map
 */

import { useState, useEffect, useRef, useCallback } from 'react'

// Country → flag emoji
const FLAGS = {
  Australia: '🇦🇺', China: '🇨🇳', Japan: '🇯🇵', Bahrain: '🇧🇭',
  'Saudi Arabia': '🇸🇦', USA: '🇺🇸', Canada: '🇨🇦', Monaco: '🇲🇨',
  Spain: '🇪🇸', Austria: '🇦🇹', 'Great Britain': '🇬🇧', Belgium: '🇧🇪',
  Hungary: '🇭🇺', Netherlands: '🇳🇱', Italy: '🇮🇹', Azerbaijan: '🇦🇿',
  Singapore: '🇸🇬', Mexico: '🇲🇽', Brazil: '🇧🇷', Qatar: '🇶🇦',
  UAE: '🇦🇪',
}

// ── GeoJSON → canvas renderer ─────────────────────────────────────────────────
function renderCircuit(canvas, coordinates) {
  if (!canvas || !coordinates?.length) return

  const ctx = canvas.getContext('2d')
  const W   = canvas.width
  const H   = canvas.height
  ctx.clearRect(0, 0, W, H)

  // Flatten + compute bounding box
  const pts = coordinates.flat ? coordinates.flat(Infinity) : coordinates
  const lngs = pts.map((p) => p[0])
  const lats  = pts.map((p) => p[1])

  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)

  const pad   = 0.1
  const dLng  = (maxLng - minLng) || 0.001
  const dLat  = (maxLat - minLat) || 0.001

  const toX = (lng) => (((lng - minLng) / dLng) * (1 - 2 * pad) + pad) * W
  // lat increases upward in geo, canvas y goes downward
  const toY = (lat) => ((1 - (lat - minLat) / dLat) * (1 - 2 * pad) + pad) * H

  // Shadow glow
  ctx.shadowColor = 'rgba(220, 0, 0, 0.35)'
  ctx.shadowBlur  = 8

  // Outer thick stroke (background line)
  ctx.beginPath()
  ctx.moveTo(toX(pts[0][0]), toY(pts[0][1]))
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(toX(pts[i][0]), toY(pts[i][1]))
  }
  ctx.closePath()
  ctx.strokeStyle = '#333'
  ctx.lineWidth   = 5
  ctx.lineJoin    = 'round'
  ctx.lineCap     = 'round'
  ctx.stroke()

  // Inner bright line
  ctx.shadowBlur  = 0
  ctx.beginPath()
  ctx.moveTo(toX(pts[0][0]), toY(pts[0][1]))
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(toX(pts[i][0]), toY(pts[i][1]))
  }
  ctx.closePath()
  ctx.strokeStyle = '#e10600'
  ctx.lineWidth   = 2
  ctx.stroke()
}

// ── Stat chip ─────────────────────────────────────────────────────────────────
function StatChip({ label, value }) {
  if (!value) return null
  return (
    <div className="flex flex-col items-center px-3 py-1.5 bg-[#0d0d0d] border border-pitwall-border">
      <span className="font-mono text-[9px] text-pitwall-ghost tracking-widest uppercase">{label}</span>
      <span className="font-mono text-xs text-pitwall-text mt-0.5">{value}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TrackMap({ circuitData, compact = false, showStats = true }) {
  const canvasRef   = useRef(null)
  const [loading, setLoading]   = useState(false)
  const [failed,  setFailed]    = useState(false)
  const [coords,  setCoords]    = useState(null)

  const slug = circuitData?.svg

  // Fetch GeoJSON
  useEffect(() => {
    setLoading(true)
    setFailed(false)
    setCoords(null)

    if (!slug) { setFailed(true); setLoading(false); return }

    let cancelled = false
    fetch(`/trackmaps/${slug}.geojson`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((geo) => {
        if (cancelled) return
        // GeoJSON feature collection → extract first LineString or Polygon
        let pts = null
        const features = geo.features ?? (geo.type === 'Feature' ? [geo] : [])
        for (const f of features) {
          const geom = f.geometry
          if (!geom) continue
          if (geom.type === 'LineString') {
            pts = geom.coordinates; break
          }
          if (geom.type === 'Polygon') {
            pts = geom.coordinates[0]; break
          }
          if (geom.type === 'MultiLineString') {
            pts = geom.coordinates[0]; break
          }
        }
        if (!pts?.length) throw new Error('no coordinates')
        setCoords(pts)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) { setFailed(true); setLoading(false) }
      })

    return () => { cancelled = true }
  }, [slug])

  // Draw on canvas whenever coords arrive or canvas resizes
  const draw = useCallback(() => {
    if (canvasRef.current && coords) {
      const el = canvasRef.current
      el.width  = el.offsetWidth  * window.devicePixelRatio
      el.height = el.offsetHeight * window.devicePixelRatio
      const ctx = el.getContext('2d')
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
      renderCircuit(el, coords)
    }
  }, [coords])

  useEffect(() => {
    draw()
  }, [draw])

  const flag    = FLAGS[circuitData?.country] ?? '🏁'
  const raceLen = circuitData
    ? ((circuitData.laps ?? 0) * (circuitData.length_km ?? 0)).toFixed(2)
    : null

  const mapHeight = compact ? 130 : 200

  return (
    <div className="w-full flex flex-col gap-2">

      {/* ── Track canvas / fallback ──────────────────────────── */}
      <div
        className="w-full border border-pitwall-border bg-[#090909] relative overflow-hidden"
        style={{ height: mapHeight }}
      >
        {!failed && !loading && coords ? (
          <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ display: 'block' }}
          />
        ) : loading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-1/2 h-1/2 rounded animate-pulse bg-[#111]" />
          </div>
        ) : (
          /* Fallback — flag + name card */
          <div className="flex flex-col items-center justify-center w-full h-full gap-2 px-4 text-center">
            <span className="text-4xl">{flag}</span>
            <span className="font-display font-bold text-xs text-pitwall-text tracking-widest uppercase leading-tight">
              {circuitData?.circuit ?? 'Circuit unavailable'}
            </span>
            {circuitData?.length_km && (
              <span className="font-mono text-[10px] text-pitwall-ghost">
                {circuitData.length_km} km · {circuitData.laps} laps
              </span>
            )}
          </div>
        )}

        {/* Circuit name overlay (bottom left when map loaded) */}
        {!failed && !loading && coords && (
          <div className="absolute bottom-1.5 left-2 font-mono text-[9px] text-pitwall-ghost/60 tracking-widest uppercase">
            {circuitData?.city ?? circuitData?.circuit ?? ''}
          </div>
        )}
      </div>

      {/* ── Stats chips ─────────────────────────────────────── */}
      {showStats && circuitData && (
        <div className="grid grid-cols-4 gap-1">
          <StatChip label="Laps"   value={circuitData.laps} />
          <StatChip label="Length" value={`${circuitData.length_km} km`} />
          <StatChip label="DRS"    value={`${circuitData.drs_zones} zones`} />
          <StatChip label="Dist."  value={raceLen ? `${raceLen} km` : null} />
        </div>
      )}

      {/* ── Lap record ──────────────────────────────────────── */}
      {showStats && circuitData?.lap_record && (
        <div className="px-3 py-2 bg-[#0d0d0d] border border-pitwall-border flex items-center justify-between gap-2">
          <span className="font-mono text-[9px] text-pitwall-ghost tracking-widest uppercase">
            Lap Record
          </span>
          <span className="font-mono text-xs text-pitwall-text">
            {circuitData.lap_record}
            <span className="text-pitwall-ghost ml-1.5">
              {circuitData.lap_record_holder} ({circuitData.lap_record_year})
            </span>
          </span>
        </div>
      )}
    </div>
  )
}
