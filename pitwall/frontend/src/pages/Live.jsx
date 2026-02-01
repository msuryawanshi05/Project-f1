import useF1Store from '../store/useF1Store'

function Live() {
  const session    = useF1Store((s) => s.session)
  const trackStatus = useF1Store((s) => s.trackStatus)
  const weather    = useF1Store((s) => s.weather)
  const timing     = useF1Store((s) => s.timing)
  const raceControl = useF1Store((s) => s.raceControl)

  return (
    <div>
      <h1>LIVE</h1>

      <p>
        Session: {session.name ?? '—'} | Phase: {session.phase} | Lap:{' '}
        {session.lap ?? '—'}/{session.total_laps ?? '—'}
      </p>

      <p>
        Track status: {trackStatus.status} — {trackStatus.message ?? '—'}
      </p>

      <p>
        Weather: Air {weather?.air_temp ?? '—'}°C | Track {weather?.track_temp ?? '—'}°C |
        Rain: {weather?.rainfall === true ? 'Yes' : weather?.rainfall === false ? 'No' : '—'}
      </p>

      <h2>Timing ({timing.length} drivers)</h2>
      {timing.length === 0 ? (
        <p>(no timing data yet — waiting for session)</p>
      ) : (
        timing.map((driver) => (
          <p key={driver.number}>
            P{driver.position} {driver.code} | gap: {driver.gap_to_ahead || '—'} |
            last: {driver.last_lap || '—'} | S1: {driver.sector_1?.time || '—'} S2:{' '}
            {driver.sector_2?.time || '—'} S3: {driver.sector_3?.time || '—'} |
            pit: {driver.in_pit ? 'YES' : 'no'}
          </p>
        ))
      )}

      <h2>Race Control (last 10)</h2>
      {raceControl.length === 0 ? (
        <p>(no messages yet)</p>
      ) : (
        raceControl.slice(0, 10).map((msg, i) => (
          <p key={i}>
            {msg.time || '—'} [{msg.flag || msg.category || '—'}] — {msg.message}
          </p>
        ))
      )}
    </div>
  )
}

export default Live
