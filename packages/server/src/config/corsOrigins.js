const CORS_ORIGINS = [
  'http://localhost:5173',    // Vite dev server
  'https://threadverse.app',  // Production web app
  'file://',                  // Desktop (production) — loadFile()
  // NOTE: In dev mode the Electron renderer loads http://localhost:5173,
  //       so it hits the first entry above.
  //
  //       If you register a custom scheme (e.g. app.setAsCustomProtocol)
  //       and load content via that scheme, the Origin will be
  //       "<scheme>://" — update this list accordingly.
  //
  //       Run the desktop app against a logging server first to confirm
  //       the exact Origin string before hardcoding any custom scheme.
];

export default CORS_ORIGINS;
