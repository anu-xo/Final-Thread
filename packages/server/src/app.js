const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const cookieParser = require('cookie-parser')

// Route imports
const authRoutes = require('./routes/auth')   // ← import the auth router

const app = express()

// ── Middleware ──────────────────────────────────────────
app.use(helmet())
app.use(morgan('dev'))
app.use(cors({
  origin: 'http://localhost:5173',   // Vite dev server
  credentials: true,                 // needed for httpOnly cookie
}))
app.use(express.json())
app.use(cookieParser())              // needed to read req.cookies.refreshToken

// ── Routes ──────────────────────────────────────────────
app.use('/auth', authRoutes)         // ← wire it here: POST /auth/register, POST /auth/login

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: 'connected' })
})

// ── Export (NOT listen — that's index.js's job) ─────────
module.exports = app