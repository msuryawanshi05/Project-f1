import useF1Store from '../store/useF1Store'

function Standings() {
  const standings = useF1Store((s) => s.standings)

  return (
    <div>
      <h1>STANDINGS</h1>

      <h2>Drivers ({standings.drivers.length})</h2>
      {standings.drivers.length === 0 ? (
        <p>(loading...)</p>
      ) : (
        standings.drivers.map((s) => (
          <p key={s.Driver?.driverId}>
            P{s.position} {s.Driver?.code ?? s.Driver?.driverId}{' '}
            {s.Driver?.familyName} ({s.Constructors?.[0]?.name ?? '—'}) —{' '}
            {s.points} pts — {s.wins} wins
          </p>
        ))
      )}

      <h2>Constructors ({standings.constructors.length})</h2>
      {standings.constructors.length === 0 ? (
        <p>(loading...)</p>
      ) : (
        standings.constructors.map((s) => (
          <p key={s.Constructor?.constructorId}>
            P{s.position} {s.Constructor?.name} — {s.points} pts — {s.wins} wins
          </p>
        ))
      )}
    </div>
  )
}

export default Standings
