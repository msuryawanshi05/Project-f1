/**
 * TrackMap.jsx — PITWALL
 * Renders an F1 circuit layout from GeoJSON.
 * Transparent canvas bg that blends with page theme.
 * Stats shown as a clean row below the map.
 * Lap record shown as inline label + value (full width, readable).
 */

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'

const FLAGS = {
  Australia: '🇦🇺', China: '🇨🇳', Japan: '🇯🇵', Bahrain: '🇧🇭',
  'Saudi Arabia': '🇸🇦', USA: '🇺🇸', Canada: '🇨🇦', Monaco: '🇲🇨',
  Spain: '🇪🇸', Austria: '🇦🇹', 'Great Britain': '🇬🇧', Belgium: '🇧🇪',
  Hungary: '🇭🇺', Netherlands: '🇳🇱', Italy: '🇮🇹', Azerbaijan: '🇦🇿',
  Singapore: '🇸🇬', Mexico: '🇲🇽', Brazil: '🇧🇷', Qatar: '🇶🇦', UAE: '🇦🇪',
}

// ── Canvas renderer ───────────────────────────────────────────────────────────
function renderCircuit(canvas, coordinates, W, H) {
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

  const drawPath = () => {
    ctx.beginPath()
    ctx.moveTo(toX(pts[0][0]), toY(pts[0][1]))
    for (let i = 1; i < pts.length; i++) ctx.lineTo(toX(pts[i][0]), toY(pts[i][1]))
    ctx.closePath()
  }

  // Outer glow
  ctx.save()
  ctx.shadowColor = 'rgba(225, 6, 0, 0.5)'
  ctx.shadowBlur  = 14
  drawPath()
  ctx.strokeStyle = '#6b0000'
  ctx.lineWidth   = 8
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  ctx.stroke()
  ctx.restore()

  // Main red line
  drawPath()
  ctx.strokeStyle = '#e10600'
  ctx.lineWidth   = 3
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  ctx.stroke()

  // Thin bright highlight
  ctx.globalAlpha = 0.25
  drawPath()
  ctx.strokeStyle = '#ff6b6b'
  ctx.lineWidth   = 1
  ctx.stroke()
  ctx.globalAlpha = 1
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

  const draw = useCallback(() => {
    if (!canvasRef.current || !coords || !containerRef.current) return
    const { offsetWidth: W, offsetHeight: H } = containerRef.current
    if (!W || !H) return
    renderCircuit(canvasRef.current, coords, W, H)
  }, [coords])

  useLayoutEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(() => { if (coords) draw() })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [coords, draw])

  const flag    = FLAGS[circuitData?.country] ?? '🏁'
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
          <div className="flex flex-col items-center justify-center w-full h-full gap-2">
            <span className="text-4xl">{flag}</span>
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
