const CORS_ORIGINS = [
  'http://localhost:5173',    // Vite dev server
  'https://threadverse.app',  // Production web app
  'electron://.',             // Desktop (production) — custom scheme via registerSchemesAsPrivileged
];

export default CORS_ORIGINS;
