// Modified from the upstream project by saiprasad00700.
// If a deployment changes hashed JS chunks while a client has an older page open,
// Vite can fail to import a chunk that no longer exists. Reload once to fetch the
// current HTML and asset manifest; the session guard prevents a reload loop.
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    reportGuardianError({
      operation: 'frontend',
      severity: 'high',
      message: event.message || 'Uncaught browser error',
      fingerprint: 'window-error'
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    reportGuardianError({
      operation: 'frontend',
      severity: 'high',
      message: reason?.message || String(reason || 'Unhandled promise rejection'),
      fingerprint: 'unhandled-rejection'
    });
  });
  window.addEventListener('vite:preloadError', (event) => {
    const guardKey = 'auction-vite-preload-reload-at';
    const lastReload = Number(window.sessionStorage.getItem(guardKey) || 0);
    if (Date.now() - lastReload > 30_000) {
      window.sessionStorage.setItem(guardKey, String(Date.now()));
      event.preventDefault();
      window.location.reload();
    }
  });
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary'
import { reportGuardianError } from './lib/guardian'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
