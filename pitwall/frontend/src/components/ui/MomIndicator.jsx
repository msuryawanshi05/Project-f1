import { memo } from 'react'
import useF1Store from '../../store/useF1Store'
import { Tooltip } from './Tooltip'

/**
 * MomIndicator — Manual Override Mode status dot for one driver.
 *
 * 2026 context
 * ------------
 * DRS is abolished for 2026. Overtaking assistance is Manual Override Mode: a
 * driver within range gets additional MGU-K deployment on demand. F1's live
 * timing feed has not added a dedicated MOM channel — the hybrid/overtake
 * channel is still car data channel 45, the one that carried DRS state, with
 * the same codes (8 = off, 10 = available, 12 = deployed).
 *
 * So this is DERIVED, not an official MOM telemetry field, and the tooltip says
 * so. It is the closest signal the public feed exposes; when F1 publishes a
 * real MOM channel this component is the only place that needs to change.
 *
 * Why its own component
 * ---------------------
 * Car data arrives continuously and is flushed into the store every 500ms. If
 * DriverRow subscribed to it, all 22 rows would re-render twice a second and
 * the tower would lose its 60fps headroom. This leaf subscribes to a single
 * primitive — one driver's deployment state — so Zustand only re-renders this
 * 28px dot, and only when that driver's state actually changes (which is
 * infrequent). DriverRow's memo is untouched.
 */
const STATES = {
  on: {
    cls: 'bg-status-green',
    glow: '0 0 6px var(--pw-green)',
    label: 'MOM deployed — extra MGU-K power being used',
  },
  available: {
    cls: 'bg-[#3671C6]',
    glow: '0 0 5px #3671C6',
    label: 'MOM available — driver is within range and may deploy',
  },
  off: {
    cls: 'bg-pitwall-border',
    glow: 'none',
    label: 'MOM not available',
  },
}

const MomIndicator = memo(function MomIndicator({ driverNumber }) {
  // Primitive selector: re-renders only when THIS driver's state changes.
  const state = useF1Store(
    (s) => s.carData[driverNumber]?.drs ?? null
  )

  // No telemetry for this driver yet — render a placeholder rather than nothing,
  // so the column doesn't jump when the first packet arrives.
  if (state == null) {
    return (
      <span
        className="inline-block w-2 h-2 rounded-full border border-pitwall-border/60"
        aria-label="Overtake mode: no telemetry"
      />
    )
  }

  const cfg = STATES[state] ?? STATES.off

  return (
    <Tooltip content={`${cfg.label} (derived from the hybrid deployment channel, not an official MOM field)`}>
      <span
        className={`inline-block w-2 h-2 rounded-full ${cfg.cls}`}
        style={{ boxShadow: cfg.glow }}
        role="img"
        aria-label={`Overtake mode: ${state}`}
      />
    </Tooltip>
  )
})

export default MomIndicator
