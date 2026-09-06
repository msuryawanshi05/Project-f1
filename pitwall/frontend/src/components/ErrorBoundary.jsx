import { Component } from 'react'

// Key used to prevent infinite reload loops
const RELOAD_KEY = 'pitwall_chunk_reload'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, chunkError: false }
  }

  static getDerivedStateFromError(error) {
    // Detect dynamic import / chunk load failures
    const msg = error?.message ?? ''
    const isChunkError =
      msg.includes('dynamically imported module') ||
      msg.includes('Failed to fetch') ||
      msg.includes('Loading chunk') ||
      msg.includes('Importing a module script failed')

    return { hasError: true, error, chunkError: isChunkError }
  }

  componentDidCatch(error, info) {
    const isChunkError = this.state.chunkError
    if (isChunkError) {
      // Auto-reload once to recover from stale chunk URLs after dev server restart
      const alreadyReloaded = sessionStorage.getItem(RELOAD_KEY)
      if (!alreadyReloaded) {
        sessionStorage.setItem(RELOAD_KEY, '1')
        window.location.reload()
        return
      }
    }
    console.error('PITWALL ErrorBoundary caught:', error, info)
  }

  handleRetry = () => {
    sessionStorage.removeItem(RELOAD_KEY)
    this.setState({ hasError: false, error: null, chunkError: false })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen flex items-center justify-center p-6"
          style={{ background: 'var(--pw-bg, #0a0a0a)' }}
        >
          <div
            className="max-w-md w-full border rounded-sm p-8 text-center shadow-2xl"
            style={{ background: 'var(--pw-surface, #111)', borderColor: 'var(--pw-border, #222)' }}
          >
            {/* Icon */}
            <div className="text-4xl mb-4" aria-hidden="true">⚠️</div>

            {/* Title */}
            <h2
              className="font-display font-black text-xl tracking-widest uppercase mb-2"
              style={{ color: 'var(--pw-text-strong, #fff)' }}
            >
              {this.state.chunkError ? 'Module Load Error' : 'Something Went Wrong'}
            </h2>

            {/* Error message */}
            {this.state.error?.message && (
              <p
                className="font-mono text-sm mb-6 leading-relaxed"
                style={{ color: 'var(--pw-dim, #555)' }}
              >
                {this.state.error.message}
              </p>
            )}

            {/* Actions */}
            {!this.state.chunkError && (
              <div className="flex gap-3 justify-center flex-wrap">
                <button
                  onClick={this.handleRetry}
                  className="px-5 py-2 font-display font-bold text-xs tracking-widest uppercase rounded-sm text-white transition-opacity hover:opacity-85"
                  style={{ background: '#E10600' }}
                >
                  Try Again
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="px-5 py-2 font-display font-bold text-xs tracking-widest uppercase rounded-sm transition-opacity hover:opacity-85"
                  style={{ background: 'var(--pw-surface-2, #1a1a1a)', color: 'var(--pw-dim, #888)', border: '1px solid var(--pw-border, #222)' }}
                >
                  Reload Page
                </button>
              </div>
            )}

            {/* Help hint */}
            <p
              className="font-mono text-[10px] mt-5 leading-relaxed"
              style={{ color: 'var(--pw-ghost, #333)' }}
            >
              If this keeps happening, try clearing your browser cache
              <span style={{ color: 'var(--pw-dim, #555)' }}> (Ctrl+Shift+Delete)</span>
            </p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
