// 1. Initialize Sentry FIRST before any other module loads
const Sentry = require('@sentry/node')

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: 0.1, // Capture 10% of requests for performance tracking
  enabled: process.env.NODE_ENV === 'production',
})

const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const cookieParser = require('cookie-parser')

// Route imports
const authRoutes = require('./routes/auth') 

const app = express()

// ── Sentry Request Handlers (MUST be the absolute first middleware) ──────
app.use(Sentry.Handlers.requestHandler())
app.use(Sentry.Handlers.tracingHandler())

// ── Standard Middleware ──────────────────────────────────────────────────
app.use(helmet())
app.use(morgan('dev'))
app.use(cors({
  origin: 'http://localhost:5173',   // Vite dev server
  credentials: true,                 // needed for httpOnly cookie
}))
app.use(express.json())
app.use(cookieParser())              // needed to read req.cookies.refreshToken

// ── Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes)     

// Desktop Version Check Endpoint
app.get('/api/desktop/version', (req, res) => {
  res.json({ 
    minimum: '1.0.0', 
    latest: '1.0.0', 
    downloadUrl: '...' 
  })
})

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: 'connected' })
})

// ── Error Handling Middleware (MUST be after routes, before custom handlers) ──
app.use(Sentry.Handlers.errorHandler())

// Custom Fallback Error Handler
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error.' })
})

// ── Export ───────────────────────────────────────────────────────────────
module.exports = app