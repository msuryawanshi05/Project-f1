import { useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'
import useF1Store from '../../store/useF1Store'
import { getTeamColour } from '../../utils/driverUtils'
import { useReplayFastestLaps } from '../../hooks/useReplay'

/**
 * Two drivers' fastest laps, overlaid on a common DISTANCE axis.
 *
 * Against time the comparison falls apart: the slower car's trace drifts
 * further behind at every corner, so by the end of the lap the two curves are
 * describing different pieces of track and the overlay says nothing. Against
 * distance, metre 2,400 is the same braking zone for both cars, and the gap
 * between the traces is the thing you actually wanted to see.
 *
 * The delta trace underneath is the cumulative time difference at each point:
 * where it rises, the second driver is losing time; where it falls, gaining.
 * A flat section is two drivers doing the same thing.
 *
 * Only possible with replay data. A live feed gives a rolling window of
 * telemetry with no lap boundaries and no distance channel, which is why this
 * could not exist before Phase F.
 */

const AXIS_TICK = { fill: 'var(--pw-ghost)', fontSize: 9, fontFamily: 'monospace' }
const GRID = 'rgba(128,128,128,0.08)'
// One label roughly every half-kilometre. Recharts labels every point by
// default, and 400 of them on a 5.8 km lap render as a solid grey bar.
const X_TICKS = 39

function fmtLap(seconds) {
  if (!Number.isFinite(seconds)) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds - m * 60
  return m > 0 ? `${m}:${s.toFixed(3).padStart(6, '0')}` : s.toFixed(3)
}

/** Linear interpolation of `ys` sampled at `xs`, evaluated at `at`. */
function interp(xs, ys, at) {
  if (!xs?.length) return null
  if (at <= xs[0]) return ys[0]
  if (at >= xs[xs.length - 1]) return ys[ys.length - 1]
  let lo = 0
  let hi = xs.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (xs[mid] <= at) lo = mid
    else hi = mid
  }
  const span = xs[hi] - xs[lo]
  if (span === 0) return ys[lo]
  return ys[lo] + ((ys[hi] - ys[lo]) * (at - xs[lo])) / span
}

export default function LapCompare({ weekend, session }) {
  const laps = useReplayFastestLaps(weekend, session)
  const drivers = useF1Store((s) => s.drivers)
  const aNum = useF1Store((s) => s.selectedTelemetryDriver)
  const bNum = useF1Store((s) => s.compareTelemetryDriver)

  const a = laps?.[String(aNum)] ?? null
  const b = laps?.[String(bNum)] ?? null

  const aColour = aNum ? getTeamColour(aNum, drivers, 'accent') : '#888'
  const bColour = bNum ? getTeamColour(bNum, drivers, 'accent') : '#5A5A66'
  const aCode = drivers.find((d) => d.number === aNum)?.code ?? aNum
  const bCode = drivers.find((d) => d.number === bNum)?.code ?? bNum

  /**
   * Both laps are resampled onto the FIRST driver's distance grid.
   *
   * Each lap is stored on its own 0..lap-length grid and the two lengths differ
   * by a few metres, so subtracting them index by index would compare slightly
   * different points of the circuit — and the error grows along the lap.
   */
  const data = useMemo(() => {
    if (!a) return []
    return a.distance.map((d, i) => {
      const row = {
        distance: Math.round(d),
        aSpeed: a.speed[i],
        aThrottle: a.throttle[i],
        aBrake: a.brake[i],
      }
      if (b) {
        row.bSpeed = Math.round(interp(b.distance, b.speed, d))
        row.bThrottle = Math.round(interp(b.distance, b.throttle, d))
        // Positive delta = the compared driver is behind at this point.
        const bt = interp(b.distance, b.time, d)
        if (bt != null) row.delta = Number((bt - a.time[i]).toFixed(3))
      }
      return row
    })
  }, [a, b])

  if (!laps) {
    return (
      <div className="px-4 py-6 text-center font-mono text-[11px]" style={{ color: 'var(--pw-ghost)' }}>
        Loading fastest laps…
      </div>
    )
  }

  if (!a) {
    return (
      <div className="px-4 py-6 text-center font-mono text-[11px]" style={{ color: 'var(--pw-ghost)' }}>
        No recorded fastest lap for this driver in {session?.toUpperCase?.() ?? 'this session'}.
      </div>
    )
  }

  const gap = b ? b.lap_time_s - a.lap_time_s : null
  const finalDelta = data.length ? data[data.length - 1]?.delta : null

  return (
    <div className="flex flex-col">
      {/* Who, and by how much */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 border-b"
        style={{ borderColor: 'var(--pw-border)', background: 'var(--pw-surface-2)' }}>
        <span className="font-display text-[10px] font-bold tracking-widest uppercase"
          style={{ color: 'var(--pw-ghost)' }}>
          Fastest lap · distance
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[11px]">
          <span className="w-2.5 h-[2px]" style={{ background: aColour }} />
          <strong style={{ color: 'var(--pw-text-strong)' }}>{aCode}</strong>
          <span style={{ color: 'var(--pw-dim)' }}>{a.lap_time ?? fmtLap(a.lap_time_s)}</span>
          <span style={{ color: 'var(--pw-ghost)' }}>L{a.lap_number}</span>
        </span>
        {b ? (
          <>
            <span className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="w-2.5 h-[2px]" style={{ background: bColour, opacity: 0.8 }} />
              <strong style={{ color: 'var(--pw-text-strong)' }}>{bCode}</strong>
              <span style={{ color: 'var(--pw-dim)' }}>{b.lap_time ?? fmtLap(b.lap_time_s)}</span>
              <span style={{ color: 'var(--pw-ghost)' }}>L{b.lap_number}</span>
            </span>
            <span className="font-mono text-[11px] tabular-nums font-bold"
              style={{ color: gap > 0 ? '#E10600' : '#00C853' }}>
              {gap > 0 ? '+' : ''}{gap?.toFixed(3)}s
            </span>
          </>
        ) : (
          <span className="font-mono text-[11px]" style={{ color: 'var(--pw-ghost)' }}>
            Pick a second driver to overlay
          </span>
        )}
      </div>

      {/* SPEED */}
      <div className="px-2 pt-3">
        <div className="font-mono text-[9px] tracking-widest uppercase px-2 mb-1"
          style={{ color: 'var(--pw-ghost)' }}>Speed · km/h</div>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="distance" tick={AXIS_TICK} height={16}
              interval={X_TICKS} tickFormatter={(v) => `${(v / 1000).toFixed(1)}km`} />
            <YAxis domain={[0, 380]} tickCount={4} tick={AXIS_TICK} width={30} />
            <Tooltip
              contentStyle={{ background: 'var(--pw-surface-2)', border: '1px solid var(--pw-border)',
                fontSize: 11, fontFamily: 'monospace' }}
              labelFormatter={(v) => `${v} m`}
              formatter={(v, n) => [`${v} km/h`, n === 'aSpeed' ? aCode : bCode]}
            />
            <Line dataKey="aSpeed" stroke={aColour} dot={false} strokeWidth={1.6} isAnimationActive={false} />
            {b && <Line dataKey="bSpeed" stroke={bColour} dot={false} strokeWidth={1.4}
              strokeDasharray="4 2" isAnimationActive={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* DELTA — the point of the whole panel */}
      {b && (
        <div className="px-2 pt-3">
          <div className="flex items-baseline justify-between px-2 mb-1">
            <span className="font-mono text-[9px] tracking-widest uppercase"
              style={{ color: 'var(--pw-ghost)' }}>
              Delta · {bCode} vs {aCode}
            </span>
            <span className="font-mono text-[9px]" style={{ color: 'var(--pw-ghost)' }}>
              above the line = {bCode} losing · finished {finalDelta > 0 ? '+' : ''}{finalDelta?.toFixed(3)}s
            </span>
          </div>
          <ResponsiveContainer width="100%" height={110}>
            <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="distance" tick={AXIS_TICK} height={16}
                interval={X_TICKS} tickFormatter={(v) => `${(v / 1000).toFixed(1)}km`} />
              <YAxis tick={AXIS_TICK} width={30} tickFormatter={(v) => v.toFixed(1)} />
              <ReferenceLine y={0} stroke="var(--pw-dim)" strokeWidth={1} />
              <Tooltip
                contentStyle={{ background: 'var(--pw-surface-2)', border: '1px solid var(--pw-border)',
                  fontSize: 11, fontFamily: 'monospace' }}
                labelFormatter={(v) => `${v} m`}
                formatter={(v) => [`${v > 0 ? '+' : ''}${v}s`, `${bCode} vs ${aCode}`]}
              />
              <Area dataKey="delta" stroke="#E10600" fill="rgba(225,6,0,0.12)"
                dot={false} strokeWidth={1.5} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* THROTTLE */}
      <div className="px-2 pt-3 pb-5">
        <div className="font-mono text-[9px] tracking-widest uppercase px-2 mb-1"
          style={{ color: 'var(--pw-ghost)' }}>Throttle · %</div>
        <ResponsiveContainer width="100%" height={90}>
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="distance" tick={AXIS_TICK} height={16}
              interval={X_TICKS} tickFormatter={(v) => `${(v / 1000).toFixed(1)}km`} />
            <YAxis domain={[0, 100]} tickCount={3} tick={AXIS_TICK} width={30} />
            <Tooltip
              contentStyle={{ background: 'var(--pw-surface-2)', border: '1px solid var(--pw-border)',
                fontSize: 11, fontFamily: 'monospace' }}
              labelFormatter={(v) => `${v} m`}
              formatter={(v, n) => [`${v}%`, n === 'aThrottle' ? aCode : bCode]}
            />
            <Line dataKey="aThrottle" stroke={aColour} dot={false} strokeWidth={1.4}
              type="stepAfter" isAnimationActive={false} />
            {b && <Line dataKey="bThrottle" stroke={bColour} dot={false} strokeWidth={1.2}
              type="stepAfter" strokeDasharray="4 2" isAnimationActive={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
