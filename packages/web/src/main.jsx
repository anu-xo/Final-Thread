// packages/web/src/main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'

// Inter font — latin subset only; other subsets load on demand via fontsource
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/latin.css'

// Fraunces — display/headlines only
import '@fontsource/fraunces/400.css'
import '@fontsource/fraunces/500.css'
import '@fontsource/fraunces/600.css'
import '@fontsource/fraunces/700.css'

// IBM Plex Mono — timestamps, karma, code
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'

import './index.css'
import App from './App.jsx'
import RootErrorBoundary from './components/RootErrorBoundary.jsx'

const sentryDsn = window.electronAPI
  ? import.meta.env.VITE_SENTRY_DSN_DESKTOP
  : import.meta.env.VITE_SENTRY_DSN;

if (sentryDsn && sentryDsn.startsWith('https://') && sentryDsn.includes('@') && !sentryDsn.includes('your-key') && !sentryDsn.includes('your-project')) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE || 'development',
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    integrations: [Sentry.browserTracingIntegration()],
  });
}

const root = createRoot(document.getElementById('root'));
root.render(
  <RootErrorBoundary>
    <StrictMode>
      <App />
    </StrictMode>
  </RootErrorBoundary>,
);
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const splash = document.getElementById('splash');
    if (splash) splash.remove();
  });
});