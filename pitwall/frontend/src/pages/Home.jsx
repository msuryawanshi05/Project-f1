import useF1Store from '../store/useF1Store'

function Home() {
  const calendar = useF1Store((s) => s.calendar)
  const standings = useF1Store((s) => s.standings)

  // Find the next upcoming race (first race with a future date)
  const now = new Date()
  const nextRace = calendar.find((r) => new Date(r.date) >= now) ?? calendar[0] ?? null

  const p1 = standings.drivers[0] ?? null

  return (
    <div>
      <h1>HOME</h1>
      <p>Calendar loaded: {calendar.length} races</p>
      <p>
        Next race: {nextRace ? `${nextRace.raceName} — ${nextRace.date}` : 'loading...'}
      </p>
      <p>Driver standings loaded: {standings.drivers.length} drivers</p>
      {p1 && (
        <p>
          P1: {p1.Driver?.code ?? p1.Driver?.driverId} ({p1.Driver?.familyName}) —{' '}
          {p1.points} pts — {p1.wins} wins
        </p>
      )}
    </div>
  )
}

export default Home
