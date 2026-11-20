// Modified from the upstream project by saiprasad00700.
// Bootstrap the React app dynamically so Firebase/module initialization failures
// are caught before they can leave the user with a blank screen.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ErrorBoundary from './components/ErrorBoundary'
import { reportGuardianError } from './lib/guardian'

const rootElement = document.getElementById('root')
const root = createRoot(rootElement)

const StartupFallback = ({ error, retry }) => (
  <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: '#050914', color: '#fff', fontFamily: 'Inter, system-ui, sans-serif' }}>
    <section style={{ width: '100%', maxWidth: '440px', textAlign: 'center', padding: '32px', borderRadius: '24px', border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)' }}>
      <div style={{ fontSize: '42px', marginBottom: '12px' }}>🏏</div>
      <h1 style={{ margin: '0 0 12px', fontSize: '24px', fontWeight: 800 }}>SS AUCTION is starting</h1>
      <p style={{ color: '#aab4c5', lineHeight: 1.6, margin: '0 0 24px' }}>A temporary startup issue prevented the page from loading. Your auction data has not been changed by this error.</p>
      {error && <p style={{ color: '#fca5a5', fontSize: '12px', overflowWrap: 'anywhere', marginBottom: '20px' }}>Details: {String(error.message || error).slice(0, 240)}</p>}
      <button onClick={retry} style={{ width: '100%', padding: '14px 18px', borderRadius: '12px', border: 0, background: '#10b981', color: '#04110b', fontWeight: 800, cursor: 'pointer' }}>Retry loading</button>
      <button onClick={() => window.location.assign('/')} style={{ width: '100%', marginTop: '10px', padding: '14px 18px', borderRadius: '12px', border: '1px solid rgba(255,255,255,.14)', background: 'transparent', color: '#d1d5db', fontWeight: 700, cursor: 'pointer' }}>Return to home</button>
    </section>
  </main>
)

function renderStartupFallback(error = null, retry = () => {}) {
  root.render(<StartupFallback error={error} retry={retry} />)
}

async function boot() {
  renderStartupFallback(null, boot)
  try {
    const { default: App } = await import('./App.jsx')
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>
    )
  } catch (error) {
    console.error('[SS AUCTION startup] Failed to initialize app:', error)
    reportGuardianError({
      operation: 'frontend-startup',
      severity: 'critical',
      message: error?.stack || error?.message || String(error),
      fingerprint: 'startup-module-failure'
    })
    renderStartupFallback(error, boot)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    reportGuardianError({
      operation: 'frontend',
      severity: 'high',
      message: event.message || 'Uncaught browser error',
      fingerprint: 'window-error'
    })
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    reportGuardianError({
      operation: 'frontend',
      severity: 'high',
      message: reason?.message || String(reason || 'Unhandled promise rejection'),
      fingerprint: 'unhandled-rejection'
    })
  })
  window.addEventListener('vite:preloadError', (event) => {
    const guardKey = 'auction-vite-preload-reload-at'
    const lastReload = Number(window.sessionStorage.getItem(guardKey) || 0)
    if (Date.now() - lastReload > 30_000) {
      window.sessionStorage.setItem(guardKey, String(Date.now()))
      event.preventDefault()
      window.location.reload()
    }
  })
}

boot()
