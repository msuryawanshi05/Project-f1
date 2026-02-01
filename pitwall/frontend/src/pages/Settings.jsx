import useF1Store from '../store/useF1Store'

function Settings() {
  const settings = useF1Store((s) => s.settings)
  const updateSettings = useF1Store((s) => s.updateSettings)

  function handleFavourites(e) {
    const nums = e.target.value
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((n) => !isNaN(n) && n > 0)
    updateSettings({ favouriteDrivers: nums })
  }

  return (
    <div>
      <h1>SETTINGS</h1>

      <p>
        Dark mode: {settings.darkMode ? 'on' : 'off'}{' '}
        <button onClick={() => updateSettings({ darkMode: !settings.darkMode })}>
          toggle
        </button>
      </p>

      <p>
        Sound: {settings.soundEnabled ? 'on' : 'off'}{' '}
        <button onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}>
          toggle
        </button>
      </p>

      <p>
        Sync delay: {settings.syncDelaySeconds}s{' '}
        <input
          type="range"
          min="0"
          max="30"
          value={settings.syncDelaySeconds}
          onChange={(e) => updateSettings({ syncDelaySeconds: +e.target.value })}
        />
      </p>

      <p>
        Favourite driver numbers (comma-separated):{' '}
        <input
          type="text"
          value={settings.favouriteDrivers.join(',')}
          onChange={handleFavourites}
          placeholder="e.g. 1,44,4"
        />
      </p>

      <p>Backend WS URL: ws://localhost:8000/ws (hardcoded — Phase 9)</p>

      <p style={{ fontSize: '12px', color: '#888' }}>
        Settings auto-saved to localStorage.
      </p>
    </div>
  )
}

export default Settings
