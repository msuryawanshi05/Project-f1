/**
 * backendOrigin.js — which backend this page talks to.
 *
 * The deployed site cannot reach F1's live timing: the feed answers 403 to
 * datacenter IP ranges. A backend on the viewer's own machine can. This lets
 * the public URL point at that machine, so a race weekend does not mean
 * opening a different address.
 *
 * ── Why this is best-effort ─────────────────────────────────────────────────
 * An https page opening ws://localhost is mixed content. Browsers carve out an
 * exception for loopback — it is a "potentially trustworthy origin" — so
 * Chrome generally permits it, but it is additionally subject to Private
 * Network Access: Chrome sends a CORS preflight for requests from a public
 * site into a private address space, and will require that for WebSockets too.
 * Firefox and Safari have not shipped PNA and treat loopback differently
 * again. None of that is under this app's control.
 *
 * So the rule is: try, fail fast, say exactly what happened, and fall back.
 * The one unacceptable outcome is a page that hangs on a connection that will
 * never open — which is what happens by default, because a blocked WebSocket
 * does not error promptly in every browser.
 */

/** Where the build says the real backend is. */
export const DEPLOYED_API = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
export const DEPLOYED_WS = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000/ws'

/** The local backend, as race-day.ps1 starts it. */
export const LOCAL_API = 'http://localhost:8000'
export const LOCAL_WS = 'ws://localhost:8000/ws'

/**
 * How long to wait before declaring the local backend unreachable.
 *
 * Short on purpose. A local backend on the same machine answers in
 * milliseconds; anything approaching a second means it is not there, or the
 * browser is quietly refusing. Waiting longer only delays the fallback.
 */
export const LOCAL_PROBE_MS = 2500

/**
 * Is the page served over https?
 *
 * The mixed-content question only arises there. Running the app from
 * http://localhost — which is what race-day.ps1 gives you — has no such
 * problem, and the toggle is pointless because you are already local.
 */
export function isSecurePage() {
  return typeof window !== 'undefined' && window.location.protocol === 'https:'
}

/** The page is already being served from a local origin. */
export function isLocalPage() {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1'
}

/**
 * Can this browser reach the local backend right now?
 *
 * A plain fetch of /health, raced against a short timeout. Done over HTTP
 * rather than by opening the WebSocket because a fetch gives a usable failure
 * quickly and distinguishably, where a blocked socket may simply never open.
 *
 * @returns {Promise<{reachable: boolean, reason: string|null}>}
 */
export async function probeLocalBackend(origin = LOCAL_API, timeoutMs = LOCAL_PROBE_MS) {
  if (typeof fetch !== 'function') return { reachable: false, reason: 'unsupported' }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${origin}/health`, {
      signal: ctrl.signal,
      // No credentials: this is a cross-origin request to the viewer's own
      // machine, and sending cookies to it would be both useless and rude.
      credentials: 'omit',
      cache: 'no-store',
    })
    return res.ok
      ? { reachable: true, reason: null }
      : { reachable: false, reason: `http_${res.status}` }
  } catch (err) {
    // A blocked mixed-content or Private Network Access request and a backend
    // that is simply not running both land here, and the browser deliberately
    // does not tell a page which — exposing that would be a scanning oracle.
    // The UI therefore has to name both possibilities rather than guess.
    return { reachable: false, reason: err?.name === 'AbortError' ? 'timeout' : 'blocked' }
  } finally {
    clearTimeout(timer)
  }
}

/** What to tell the viewer when the local backend could not be reached. */
export function localFailureMessage(reason) {
  switch (reason) {
    case 'timeout':
      return 'No answer from localhost:8000 within a couple of seconds. Either PITWALL is not running on this machine, or the browser blocked the connection from an https page.'
    case 'unsupported':
      return 'This browser cannot make the check.'
    default:
      return 'The browser refused the connection to localhost:8000. Chrome and Firefox treat requests from an https page into your own machine differently, and either may block it.'
  }
}

/** The advice that always works, whatever the browser decided. */
export const LOCAL_FALLBACK_ADVICE =
  'Open the app at http://localhost:8000 instead — same app, same data, no cross-origin rules to satisfy.'

/**
 * Resolve the origins the app should actually use.
 *
 * `useLocal` is the viewer's preference; `localOk` is whether the probe
 * succeeded. Both must hold, so a stored preference can never strand the page
 * on a backend that is not answering.
 */
export function resolveOrigins({ useLocal, localOk }) {
  if (useLocal && localOk) return { api: LOCAL_API, ws: LOCAL_WS, local: true }
  return { api: DEPLOYED_API, ws: DEPLOYED_WS, local: false }
}
