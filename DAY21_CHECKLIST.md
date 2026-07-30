# Day 21 — Green-Light Checklist

## Sentry Configuration
- [ ] Real Sentry DSN obtained from https://sentry.io
- [ ] `SENTRY_DSN` set in `packages/server/.env` (replace placeholder)
- [ ] `VITE_SENTRY_DSN` added to `packages/web/.env`
- [ ] `VITE_SENTRY_DSN` added to `packages/web/.env.staging` (if staging uses web frontend)

## Server-Side Monitoring
- [x] `Sentry.init` in `packages/server/src/app.js` with DSN guard
- [x] `setupExpressErrorHandler` installed (auto-captures Express errors)
- [x] Duplicate `Sentry.captureException` removed from custom error handler
- [x] `process.on('uncaughtException')` in `packages/server/src/index.js` — captures + flushes + exits
- [x] `process.on('unhandledRejection')` in `packages/server/src/index.js` — captures + flushes + exits
- [x] `Sentry.setUser({ id })` in auth middleware (`packages/server/src/middleware/auth.js`)
- [x] `Sentry.captureException` on token verification failure in auth middleware

## Web Frontend Monitoring
- [x] `Sentry.init` in `packages/web/src/main.jsx` with DSN guard
- [x] `browserTracingIntegration()` enabled
- [x] Supports both browser DSN (`VITE_SENTRY_DSN`) and Electron DSN (`VITE_SENTRY_DSN_DESKTOP`)

## Desktop (Electron) Monitoring
- [x] `@sentry/electron` installed (`packages/desktop/package.json` + `pnpm install`)
- [x] Dynamic import of `@sentry/electron` in `packages/desktop/main.mjs` with graceful fallback
- [x] `uncaughtException` / `unhandledRejection` handlers with Sentry capture + flush
- [x] `web-contents.render-process-gone` event handler for crash reporting

## Testing & Verification
- [ ] Jest test suite: **30 pass, 3 known pre-existing failures** (postCreate ModerationLog source, aiRateLimit mock Redis, embeddingQueueConfig singleton)
- [ ] k6 load test passes against staging server (requires k6 CLI: `winget install k6` or `choco install k6`)
- [ ] E2E tests pass (note: uses mock API layer — won't exercise real Sentry delivery)
- [ ] Confirm no unhandled errors surface during load test via Sentry dashboard

## Known Pre-Existing Test Failures (Not Sentry-Related)
| Test | Issue |
|---|---|
| `postCreate.test.js` | ModerationLog `source` field required — controller doesn't set it |
| `aiRateLimit.test.js` | Mock Redis missing `incr`/`expire` methods |
| `embeddingQueueConfig.test.js` | Singleton comparison fails with mocked Queue instances |

## Staging Deployment
- [ ] Server deployed to Render (or staging host)
- [ ] Web frontend deployed
- [ ] Desktop app built and distributed (requires staging API URL in `VITE_API_URL`)
- [ ] Sentry events visible in Sentry dashboard after staging smoke test
