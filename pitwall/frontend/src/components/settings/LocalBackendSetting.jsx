import useBackendOrigin from '../../hooks/useBackendOrigin'
import { LOCAL_API, LOCAL_FALLBACK_ADVICE } from '../../utils/backendOrigin'

/**
 * Point the app at a backend running on this machine.
 *
 * The reason it exists: F1's live timing answers 403 to datacenter IP ranges,
 * so the deployed site can never stream a session. A backend on the viewer's
 * own machine can. This lets the public URL be used on a race weekend without
 * having to remember a different address.
 *
 * Labelled experimental because it is: an https page opening a connection to
 * loopback is mixed content, and whether that is allowed is the browser's
 * decision. The app's job is to fail fast, say what happened, and fall back —
 * never to sit on a connection that will not open.
 */
export default function LocalBackendSetting() {
  const backend = useBackendOrigin()

  // Already served from this machine: there is nothing to point anywhere.
  if (!backend.offerable) return null

  return (
    <section className="px-6 py-6 border-t border-pitwall-border">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-display font-semibold text-sm text-pitwall-text tracking-wide">
              Use a local backend
            </span>
            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm border"
              style={{ borderColor: 'var(--pw-border)', color: 'var(--pw-ghost)' }}>
              EXPERIMENTAL
            </span>
          </div>
          <div className="font-mono text-xs text-pitwall-ghost mt-1 leading-relaxed">
            F1 refuses live timing to this server&apos;s network, so the deployed site
            can only replay. A copy of PITWALL running on your own machine can reach
            the feed — point this page at it and live timing works here too.
          </div>
          <div className="font-mono text-[10px] text-pitwall-ghost mt-1.5">
            Start it with <code>pitwall\race-day.ps1</code>, then turn this on.
          </div>
          <div className="font-mono text-[10px] mt-1.5 leading-relaxed text-status-yellow">
            Measured 15 Oct 2026: Chrome blocks this. A request from this https page
            to localhost is not refused — it simply never completes, so the toggle
            waits 2.5s and falls back. Do not rely on it during a session.
          </div>
          <div className="font-mono text-[10px] text-pitwall-ghost mt-1.5">
            What does work: run <code>race-day.ps1</code> and open{' '}
            <strong>http://localhost:8000</strong> directly — same app, live timing,
            no cross-origin rules to satisfy.
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={backend.wanted}
          onClick={() => backend.setUseLocal(!backend.wanted)}
          className="flex-shrink-0 w-11 h-6 rounded-full border transition-colors relative"
          style={{
            borderColor: 'var(--pw-border)',
            background: backend.wanted ? '#00C853' : 'var(--pw-surface-2)',
          }}
        >
          <span
            className="absolute top-[3px] w-4 h-4 rounded-full transition-all"
            style={{ left: backend.wanted ? 24 : 4, background: '#fff' }}
          />
        </button>
      </div>

      {/* State, stated. Each branch says what is actually happening. */}
      {backend.wanted && (
        <div className="mt-3 px-3 py-2 rounded-sm border font-mono text-[11px] leading-relaxed"
          style={{
            borderColor: backend.local ? 'rgba(0,200,83,0.4)' : 'var(--pw-border)',
            background: backend.local ? 'rgba(0,200,83,0.07)' : 'var(--pw-surface-2)',
            color: 'var(--pw-dim)',
          }}>
          {backend.checking ? (
            <span>Checking {LOCAL_API}…</span>
          ) : backend.local ? (
            <span style={{ color: '#00C853' }}>
              Connected to {LOCAL_API}. Live timing is available while a session runs.
            </span>
          ) : (
            <>
              <div style={{ color: 'var(--pw-text-strong)' }}>
                Could not use the local backend — still on the deployed one.
              </div>
              <div className="mt-1">{backend.message}</div>
              <div className="mt-1.5">{LOCAL_FALLBACK_ADVICE}</div>
              <button
                type="button"
                onClick={backend.retry}
                className="mt-2 font-mono text-[10px] tracking-wider uppercase px-2 py-1 border rounded-sm"
                style={{ borderColor: 'var(--pw-border)', color: 'var(--pw-dim)' }}
              >
                Try again
              </button>
            </>
          )}
        </div>
      )}
    </section>
  )
}
