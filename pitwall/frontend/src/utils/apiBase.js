import useF1Store from '../store/useF1Store'

/**
 * The backend this page should call, right now.
 *
 * A function rather than a module constant: the origin can change mid-session
 * when the local-backend toggle flips, and a constant captured at import time
 * would leave half the app calling the old one.
 */
export function apiBase() {
  return useF1Store.getState().backend.api
}

export function wsUrl() {
  return useF1Store.getState().backend.ws
}

export default apiBase
