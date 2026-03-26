import useF1Store from '../store/useF1Store'
import teamsData from '../data/teams.json'

const ALL_DRIVERS = Object.entries(teamsData.driverTeams).map(([num, team]) => ({
  number: num,
  team,
  colour: teamsData.teamColours[team] ?? '#444',
}))

export default function Settings() {
  const settings       = useF1Store((s) => s.settings)
  const updateSettings = useF1Store((s) => s.updateSettings)

  function toggleFav(num) {
    const favs = settings.favouriteDrivers ?? []
    const next = favs.includes(num)
      ? favs.filter((n) => n !== num)
      : [...favs, num]
    updateSettings({ favouriteDrivers: next })
  }

  return (
    <div className="min-h-full bg-pitwall-bg max-w-2xl mx-auto">
      {/* Header */}
      <div className="border-b border-pitwall-border px-6 py-4">
        <h1 className="font-display font-bold text-3xl tracking-widest text-white uppercase">Settings</h1>
      </div>

      <div className="divide-y divide-pitwall-border">

        {/* Favourite Drivers */}
        <section className="px-6 py-6">
          <div className="font-mono text-xs text-pitwall-ghost tracking-widest uppercase mb-4">
            Favourite Drivers
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL_DRIVERS.map(({ number, team, colour }) => {
              const isFav = (settings.favouriteDrivers ?? []).includes(number)
              return (
                <button
                  key={number}
                  onClick={() => toggleFav(number)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 border transition-colors font-mono text-xs"
                  style={{
                    borderColor: isFav ? colour : '#333',
                    backgroundColor: isFav ? `${colour}22` : 'transparent',
                    color: isFav ? colour : '#888',
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: colour }}
                  />
                  #{number}
                </button>
              )
            })}
          </div>
          <div className="font-mono text-[10px] text-pitwall-ghost mt-3">
            {(settings.favouriteDrivers ?? []).length} selected · highlighted in Standings and Live tower
          </div>
        </section>

        {/* Sound */}
        <section className="px-6 py-6 flex items-center justify-between">
          <div>
            <div className="font-display font-semibold text-sm text-pitwall-text tracking-wide">Sound Alerts</div>
            <div className="font-mono text-xs text-pitwall-ghost mt-0.5">Play audio for race control events</div>
          </div>
          <button
            onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
            className={`w-12 h-6 rounded transition-colors relative flex-shrink-0 ${
              settings.soundEnabled ? 'bg-status-green' : 'bg-pitwall-muted'
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded transition-transform ${
                settings.soundEnabled ? 'translate-x-6' : 'translate-x-0.5'
              }`}
            />
          </button>
        </section>

        {/* Sync Delay */}
        <section className="px-6 py-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-display font-semibold text-sm text-pitwall-text tracking-wide">Sync Delay</div>
              <div className="font-mono text-xs text-pitwall-ghost mt-0.5">
                Delay data to match TV broadcast
              </div>
            </div>
            <div className="font-mono text-sm text-pitwall-text">
              {settings.syncDelaySeconds === 0
                ? 'No delay'
                : `+${settings.syncDelaySeconds}s`}
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={30}
            step={1}
            value={settings.syncDelaySeconds}
            onChange={(e) => updateSettings({ syncDelaySeconds: parseInt(e.target.value, 10) })}
            className="w-full accent-status-red"
          />
          <div className="flex justify-between font-mono text-[10px] text-pitwall-ghost mt-1">
            <span>0s (real-time)</span>
            <span>30s (broadcast)</span>
          </div>
        </section>

        {/* Dark mode */}
        <section className="px-6 py-6 flex items-center justify-between">
          <div>
            <div className="font-display font-semibold text-sm text-pitwall-text tracking-wide">Dark Mode</div>
            <div className="font-mono text-xs text-pitwall-ghost mt-0.5">Always-on cockpit theme</div>
          </div>
          <button
            onClick={() => updateSettings({ darkMode: !settings.darkMode })}
            className={`w-12 h-6 rounded transition-colors relative flex-shrink-0 ${
              settings.darkMode ? 'bg-status-green' : 'bg-pitwall-muted'
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded transition-transform ${
                settings.darkMode ? 'translate-x-6' : 'translate-x-0.5'
              }`}
            />
          </button>
        </section>

        {/* About */}
        <section className="px-6 py-6">
          <div className="font-mono text-xs text-pitwall-ghost tracking-widest uppercase mb-4">About</div>
          <div className="font-mono text-xs text-pitwall-dim space-y-1">
            <div className="text-pitwall-ghost">PITWALL v0.5 — Phase 5 Alpha</div>
            <div className="mt-3 font-mono text-[10px] text-pitwall-ghost/70 uppercase tracking-widest">Data sources</div>
            <div>
              <a href="https://api.jolpi.ca" target="_blank" rel="noreferrer" className="text-pitwall-dim hover:text-pitwall-text underline">
                Jolpica (Ergast) — Calendar, Standings, Results
              </a>
            </div>
            <div>
              <a href="https://openf1.org" target="_blank" rel="noreferrer" className="text-pitwall-dim hover:text-pitwall-text underline">
                OpenF1 — Car Data, Radio, Track Map
              </a>
            </div>
            <div>
              <a href="https://open-meteo.com" target="_blank" rel="noreferrer" className="text-pitwall-dim hover:text-pitwall-text underline">
                Open-Meteo — Weather Forecasts
              </a>
            </div>
            <div>
              <a href="https://en.wikipedia.org" target="_blank" rel="noreferrer" className="text-pitwall-dim hover:text-pitwall-text underline">
                Wikipedia — Circuit Information
              </a>
            </div>
            <div>
              <a href="https://github.com/ornikar/f1-track-vectors" target="_blank" rel="noreferrer" className="text-pitwall-dim hover:text-pitwall-text underline">
                f1-track-vectors — Circuit SVGs
              </a>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
