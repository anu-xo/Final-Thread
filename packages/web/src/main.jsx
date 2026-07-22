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

import './index.css'
import App from './App.jsx'

Sentry.init({
  dsn: window.electronAPI
    ? import.meta.env.VITE_SENTRY_DSN_DESKTOP
    : import.meta.env.VITE_SENTRY_DSN,
  enabled: Boolean(
    window.electronAPI
      ? import.meta.env.VITE_SENTRY_DSN_DESKTOP
      : import.meta.env.VITE_SENTRY_DSN
  ),
});

const root = createRoot(document.getElementById('root'));
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const splash = document.getElementById('splash');
    if (splash) splash.remove();
  });
});