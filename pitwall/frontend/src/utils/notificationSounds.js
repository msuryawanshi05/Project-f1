/**
 * notificationSounds.js
 *
 * Generates audio feedback using Web Audio API — no external files required.
 * AudioContext is created lazily on first call to avoid browser autoplay policy.
 *
 * All sounds respect the `settings.soundEnabled` flag in the Zustand store.
 */
import useF1Store from '../store/useF1Store'

let _ctx = null

function getCtx() {
  if (!_ctx) {
    _ctx = new (globalThis.AudioContext || globalThis.webkitAudioContext)()
  }
  // Resume if suspended (happens on Safari / after inactivity)
  if (_ctx.state === 'suspended') _ctx.resume()
  return _ctx
}

function isEnabled() {
  return useF1Store.getState().settings.soundEnabled !== false
}

/**
 * Play a single oscillator tone.
 * @param {number} frequency  Hz
 * @param {number} duration   seconds
 * @param {string} type       OscillatorType: 'sine'|'square'|'sawtooth'|'triangle'
 * @param {number} volume     0–1
 * @param {number} delay      seconds before start (default 0)
 */
function playTone(frequency, duration, type = 'sine', volume = 0.3, delay = 0) {
  if (!isEnabled()) return
  try {
    const ctx  = getCtx()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.frequency.value = frequency
    osc.type = type

    const start = ctx.currentTime + delay
    gain.gain.setValueAtTime(volume, start)
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration)

    osc.start(start)
    osc.stop(start + duration)
  } catch (e) {
    // Silently ignore — audio context may not exist yet
    console.debug('[Sound] playTone failed:', e.message)
  }
}

export const sounds = {
  /** Critical — two descending tones, urgent (Safety Car, Red Flag, Retirement) */
  critical() {
    playTone(880, 0.12, 'square', 0.35)
    playTone(660, 0.18, 'square', 0.35, 0.13)
  },

  /** High — single mid tone (VSC, Penalty, Pit stop) */
  high() {
    playTone(660, 0.14, 'sine', 0.28)
  },

  /** Medium — soft high tone (Fastest lap, DRS) */
  medium() {
    playTone(1047, 0.1, 'sine', 0.2)
  },

  /** Info — barely audible click */
  info() {
    playTone(440, 0.05, 'sine', 0.1)
  },

  /** Teal — gentle two-tone (Green flag, Rain) */
  teal() {
    playTone(523, 0.1, 'sine', 0.22)
    playTone(659, 0.12, 'sine', 0.22, 0.1)
  },

  /** Blue — mid-range single (DRS) */
  blue() {
    playTone(784, 0.1, 'sine', 0.2)
  },

  /** Chequered — ascending 3-tone fanfare */
  chequered() {
    playTone(523, 0.1, 'sine', 0.28)
    playTone(659, 0.1, 'sine', 0.3, 0.11)
    playTone(784, 0.22, 'sine', 0.38, 0.22)
  },
}

/**
 * Unlock AudioContext on first user click.
 * Call this once in App.jsx useEffect.
 */
export function unlockAudio() {
  const unlock = () => {
    try {
      getCtx()
    } catch (err) {
      // AudioContext may not be available in some environments
      console.debug('[Audio] unlock failed:', err.message)
    }
    document.removeEventListener('click', unlock, { capture: true })
  }
  document.addEventListener('click', unlock, { capture: true, once: true })
}
