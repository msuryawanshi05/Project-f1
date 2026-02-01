import useF1Store from '../store/useF1Store'

function Season() {
  const calendar = useF1Store((s) => s.calendar)

  return (
    <div>
      <h1>SEASON</h1>
      <p>2026 Formula 1 World Championship — {calendar.length} rounds</p>

      {calendar.length === 0 ? (
        <p>(loading calendar...)</p>
      ) : (
        calendar.map((race) => (
          <p key={race.round}>
            R{race.round} — {race.raceName} — {race.Circuit?.circuitName ?? '—'} —{' '}
            {race.date}
            {race.Sprint ? ' [SPRINT]' : ''}
          </p>
        ))
      )}
    </div>
  )
}

export default Season
