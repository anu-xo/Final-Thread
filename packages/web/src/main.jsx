// packages/web/src/main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
// import * as Sentry from '@sentry/electron/renderer';

if (window.electronAPI) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN_DESKTOP,
  });
}
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)