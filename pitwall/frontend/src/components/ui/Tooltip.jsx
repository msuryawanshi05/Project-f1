import { useState } from 'react'
import useF1Store from '../../store/useF1Store'
import teamsData from '../../data/teams.json'
import { getSafeTeamColour } from '../../utils/driverUtils'

function getTeamColourByName(teamName) {
  if (!teamName) return '#888888'
  const hex = Object.entries(teamsData.teamColours).find(([k]) =>
    teamName.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(teamName.toLowerCase())
  )?.[1] ?? '#888888'
  return getSafeTeamColour(hex)
}

export function Tooltip({ content, children, className = '' }) {
  return (
    <div className={`relative group/tt inline-block ${className}`}>
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tt:block z-[9999] pointer-events-none">
        <div className="bg-black/95 border border-white/10 text-white font-mono text-[10px] px-2.5 py-1.5 rounded shadow-xl whitespace-nowrap skew-x-[-8deg] flex items-center gap-1.5">
          <div className="w-1 h-3 bg-status-red flex-shrink-0" />
          <span className="skew-x-[8deg]">{content}</span>
        </div>
      </div>
    </div>
  )
}

export function MiniPodiumPreview({ round, children }) {
  const results = useF1Store((s) => s.results)
  const setResults = useF1Store((s) => s.setResults)
  const resultsData = results[round]
  const [loading, setLoading] = useState(false)

  const handleMouseEnter = async () => {
    if (resultsData || loading) return
    setLoading(true)
    try {
      const res = await fetch(`https://api.jolpi.ca/ergast/f1/2026/${round}/results.json`)
      const data = await res.json()
      const races = data?.MRData?.RaceTable?.Races
      if (!races?.length) {
        setResults(round, { empty: true })
      } else {
        setResults(round, races[0])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const podium = resultsData?.Results?.slice(0, 3) ?? []

  return (
    <div className="relative group/podium inline-block" onMouseEnter={handleMouseEnter}>
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/podium:block z-[9999] pointer-events-none">
        <div className="bg-black/95 border border-white/10 text-white p-3 rounded-sm shadow-2xl skew-x-[-6deg] min-w-[200px]">
          <div className="skew-x-[6deg] space-y-2">
            <div className="font-display font-extrabold text-[10px] tracking-widest text-status-red border-b border-white/10 pb-1 mb-1">
              RACE PODIUM
            </div>
            
            {loading && (
              <div className="font-mono text-[9px] text-pitwall-dim animate-pulse">
                LOADING PODIUM...
              </div>
            )}
            
            {!loading && (!resultsData || resultsData.empty || !resultsData.Results) && (
              <div className="font-mono text-[9px] text-pitwall-dim">
                NO RESULTS AVAILABLE
              </div>
            )}

            {!loading && resultsData && !resultsData.empty && podium.length > 0 && (
              podium.map((res, idx) => {
                const driver = res.Driver ?? {}
                const code = driver.code ?? '???'
                const constructor = res.Constructor?.name ?? ''
                const time = res.Time?.time ?? res.status ?? '—'
                const rankColor = idx === 0 ? '#FFD700' : idx === 1 ? '#C0C0C0' : '#CD7F32'
                const tColor = getTeamColourByName(constructor)

                return (
                  <div key={idx} className="flex items-center justify-between gap-4 font-mono text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <span style={{ color: rankColor }} className="font-bold">P{idx + 1}</span>
                      <span className="font-bold uppercase" style={{ color: tColor }}>{code}</span>
                      <span className="text-[8px] uppercase truncate max-w-[60px]" style={{ color: tColor, opacity: 0.85 }}>{constructor}</span>
                    </div>
                    <span className="text-pitwall-dim text-[9px]">{time}</span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
