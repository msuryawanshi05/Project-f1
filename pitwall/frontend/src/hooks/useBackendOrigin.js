import { useCallback, useEffect, useState } from 'react'
import useF1Store from '../store/useF1Store'
import {
  DEPLOYED_API, DEPLOYED_WS, LOCAL_API,
  probeLocalBackend, resolveOrigins, isLocalPage, isSecurePage,
  localFailureMessage,
} from '../utils/backendOrigin'

/**
 * Point the app at a backend on the viewer's own machine, or the deployed one.
 *
 * Experimental and best-effort, because whether an https page may open a
 * connection to loopback is the browser's decision and not this app's. The
 * contract here is about failure, not success: probe quickly, never hang, say
 * plainly what happened, and always end up on a backend that answers.
 *
 * The probe re-runs when the preference changes and on a window focus, because
 * the usual sequence is "turn it on, realise the backend is not started, start
 * it, come back".
 */
export function useBackendOrigin() {
  const settings = useF1Store((s) => s.settings)
  const updateSettings = useF1Store((s) => s.updateSettings)
  const wanted = Boolean(settings.useLocalBackend)

  const [state, setState] = useState({
    checking: wanted,
    localOk: false,
    reason: null,
  })

  const probe = useCallback(async () => {
    if (!wanted) {
      setState({ checking: false, localOk: false, reason: null })
      return false
    }
    setState((s) => ({ ...s, checking: true }))
    const { reachable, reason } = await probeLocalBackend(LOCAL_API)
    setState({ checking: false, localOk: reachable, reason })
    return reachable
  }, [wanted])

  useEffect(() => { probe() }, [probe])

  useEffect(() => {
    if (!wanted) return undefined
    // Coming back to the tab is the moment the viewer has just started the
    // local backend, so it is worth one more try.
    const onFocus = () => { probe() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [wanted, probe])

  const origins = resolveOrigins({ useLocal: wanted, localOk: state.localOk })

  return {
    ...origins,
    wanted,
    checking: state.checking,
    // The preference is on but the backend is not answering: the app is on the
    // deployed backend and the header has to say so, or the viewer sits there
    // wondering why there is no live timing.
    degraded: wanted && !state.checking && !state.localOk,
    message: state.reason ? localFailureMessage(state.reason) : null,
    // Pointless where the page is already local, and the mixed-content
    // question only exists on https.
    offerable: !isLocalPage(),
    secure: isSecurePage(),
    deployed: { api: DEPLOYED_API, ws: DEPLOYED_WS },
    setUseLocal: (v) => updateSettings({ useLocalBackend: Boolean(v) }),
    retry: probe,
  }
}

export default useBackendOrigin
