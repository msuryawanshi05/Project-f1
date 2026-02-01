import { useState } from 'react'
import useF1Store from '../store/useF1Store'

const BASE = 'https://api.jolpi.ca/ergast/f1/2026'

function Results() {
  const calendar = useF1Store((s) => s.calendar)
  const results  = useF1Store((s) => s.results)
  const setResults = useF1Store((s) => s.setResults)

  const [loading, setLoading] = useState(null)  // round number currently loading
  const [error, setError] = useState(null)

  async function fetchResult(round) {
    if (results[round]) return   // already cached
    setLoading(round)
    setError(null)
    try {
      const res = await fetch(`${BASE}/${round}/results.json`)
      const data = await res.json()
      const race = data?.MRData?.RaceTable?.Races?.[0] ?? null
      setResults(round, race)
    } catch (err) {
      setError(`R${round}: ${err.message}`)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div>
      <h1>RESULTS</h1>
      <p>Click a round to load race results:</p>

      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      {calendar.map((race) => {
        const result = results[race.round]
        return (
          <div key={race.round} style={{ marginBottom: '8px' }}>
            <p
              style={{ cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => fetchResult(race.round)}
            >
              R{race.round} — {race.raceName} ({race.date})
              {loading === race.round ? ' [loading...]' : ''}
              {result ? ' ✓' : ''}
            </p>

            {result && (
              <div style={{ paddingLeft: '16px' }}>
                {(result.Results ?? []).map((r) => (
                  <p key={r.number}>
                    P{r.position} {r.Driver?.code ?? r.Driver?.driverId}{' '}
                    {r.Driver?.familyName} ({r.Constructor?.name}) —{' '}
                    {r.status} — {r.points} pts
                    {r.FastestLap?.rank === '1' ? ' [FL]' : ''}
                  </p>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default Results
