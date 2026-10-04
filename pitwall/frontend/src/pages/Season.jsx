import { useState } from 'react'
import { motion } from 'framer-motion'
import useF1Store from '../store/useF1Store'
import circuits from '../data/circuits.json'
import CircuitDetailPanel from '../components/season/CircuitDetailPanel'
import { getCountryAbbreviation, getRaceStatus } from '../utils/driverUtils'
import { MiniPodiumPreview } from '../components/ui/Tooltip'

function matchCircuit(race) {
  const rn = (race.raceName ?? '').toLowerCase().replace(' grand prix', '').trim()
  return circuits.find((c) => {
    const cn = (c.name ?? '').toLowerCase().replace(' grand prix', '').trim()
    return cn.includes(rn) || rn.includes(cn)
  })
}

export default function Season() {
  const calendar        = useF1Store((s) => s.calendar)
  const calendarLoading = useF1Store((s) => s.calendarLoading)
  const results         = useF1Store((s) => s.results)
  const [selectedRace, setSelectedRace] = useState(null)

  if (calendarLoading) {
    return (
      <div className="flex items-center justify-center h-64 font-mono text-pitwall-dim text-sm">
        Loading season data…
      </div>
    )
  }

  const now = new Date()

  function selectRace(race) {
    setSelectedRace((prev) => (prev?.round === race.round ? null : race))
  }

  const selectedCircuit = selectedRace ? matchCircuit(selectedRace) : null

  return (
    <div className="min-h-full bg-pitwall-bg relative">
      {/* Header */}
      <div className="border-b border-pitwall-border px-6 py-4">
        <h1 className="font-display font-bold text-3xl tracking-widest text-pitwall-text-strong uppercase">
          2026 Season
        </h1>
        <div className="font-mono text-xs text-pitwall-dim mt-1">
          {calendar.length} rounds · Formula 1 World Championship
        </div>
      </div>

      {/* Race list — shrinks when panel is open */}
      <div
        className="divide-y divide-pitwall-border transition-all duration-300"
        style={{ marginRight: selectedRace ? 480 : 0 }}
      >
        {calendar.map((race, i) => {
          const circuitData = matchCircuit(race)
          const country     = race.Circuit?.Location?.country ?? ''
          const flag        = getCountryAbbreviation(country)
          const statusInfo  = getRaceStatus(race, now)
          const isPast      = statusInfo.isDone
          const isOngoing   = statusInfo.isOngoing
          const isNext      = !isPast && !isOngoing && calendar.find((r) => {
            const s = getRaceStatus(r, now)
            return !s.isDone && !s.isOngoing
          })?.round === race.round
          const isSelected  = selectedRace?.round === race.round
          const resultsData = results[race.round]

          return (
            <motion.div
              key={race.round}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-10px' }}
              transition={{ duration: 0.35, delay: Math.min(i * 0.03, 0.4), ease: 'easeOut' }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && selectRace(race)}
              onClick={() => selectRace(race)}
              className={`flex items-center gap-4 px-6 py-3 transition-colors cursor-pointer select-none ${
                isSelected     ? 'bg-pitwall-surface-2' :
                isOngoing      ? 'bg-status-green/10 hover:bg-status-green/15' :
                isPast         ? 'opacity-60 hover:bg-pitwall-surface/30' :
                isNext         ? 'bg-pitwall-surface hover:bg-pitwall-surface-2/80' :
                                 'hover:bg-pitwall-surface/50'
              }`}
              style={
                isOngoing ? { borderLeft: '3px solid var(--pw-green)' } :
                isNext ? { borderLeft: '3px solid var(--pw-red)' } :
                { borderLeft: `3px solid ${isSelected ? 'var(--pw-red)' : 'transparent'}` }
              }
            >
            {/* Round */}
            <div className="w-8 flex-shrink-0 font-mono text-xs text-pitwall-dim text-right">
              R{race.round}
            </div>

            {/* Flag */}
            <div className="flex-shrink-0 font-mono font-bold text-xs bg-pitwall-surface-2 border border-pitwall-border px-1.5 py-0.5 rounded-sm text-pitwall-text-strong w-10 text-center">
              {flag}
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0">
              <div className="font-display font-semibold text-sm tracking-wide text-pitwall-text-strong truncate">
                {race.raceName}
              </div>
              <div className="font-mono text-xs text-pitwall-dim truncate">
                {race.Circuit?.circuitName ?? ''} · {country}
              </div>
            </div>

            {/* Sprint badge */}
            {circuitData?.sprint && (
              <div className="flex-shrink-0 font-mono text-[10px] text-status-yellow border border-status-yellow/40 px-1.5 py-0.5 tracking-widest">
                SPRINT
              </div>
            )}

            {/* Date */}
            <div className="flex-shrink-0 font-mono text-xs text-pitwall-text-strong w-24 text-right">
              {race.date}
            </div>

            {/* Status */}
            {isOngoing && (
              <div className="flex-shrink-0 font-mono text-[10px] text-status-green border border-status-green/60 bg-status-green/15 px-2 py-0.5 font-bold tracking-wider animate-pulse flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-status-green inline-block" />
                ONGOING
              </div>
            )}
            {isPast && (
              <MiniPodiumPreview round={race.round}>
                <div className="flex-shrink-0 font-mono text-[10px] text-pitwall-dim border border-pitwall-border px-1.5 py-0.5 hover:text-white hover:border-white transition-colors cursor-help">
                  DONE
                </div>
              </MiniPodiumPreview>
            )}
            {isNext && !isSelected && (
              <div className="flex-shrink-0 font-mono text-[10px] text-status-red border border-status-red/40 px-1.5 py-0.5">
                NEXT
              </div>
            )}
            {isSelected && (
              <div className="flex-shrink-0 font-mono text-[10px] text-status-red">›</div>
            )}
            </motion.div>
          )
        })}
      </div>

      {/* Circuit detail panel */}
      {selectedRace && (
        <CircuitDetailPanel
          race={selectedRace}
          circuitData={selectedCircuit}
          onClose={() => setSelectedRace(null)}
        />
      )}
    </div>
  )
}
