const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const mongoose = require('mongoose');
const { Redis } = require('ioredis');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
console.log('MONGODB_URI loaded:', !!process.env.MONGODB_URI);

const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:5173',  // Vite dev server
    'electron://'             // Electron renderer
  ],
  credentials: true,
}));
app.use(morgan('dev'));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── MongoDB Connection ──────────────────────────────────────────────────────
const connectDB = async () => {
  try {
    console.log("Your URI is:", process.env.MONGODB_URI);
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
};

// ── Redis Connection ────────────────────────────────────────────────────────
const redis = new Redis(process.env.REDIS_URL);

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => console.error('❌ Redis error:', err.message));

// Make redis available globally in app
app.set('redis', redis);

// ── Embedding Worker ─────────────────────────────────────────────────────────
require('./jobs/embeddingWorker') // starts listening for embedding jobs
const { testEmbeddingConnection } = require('./services/embeddingService')
testEmbeddingConnection() // non-blocking test on startup

// ── Routes ──────────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = dbState === 1 ? 'connected' : 'disconnected';

  let redisStatus = 'disconnected';
  try {
    await redis.ping();
    redisStatus = 'connected';
  } catch {
    redisStatus = 'disconnected';
  }

  res.json({
    status: 'ok',
    db: dbStatus,
    redis: redisStatus,
    timestamp: new Date().toISOString(),
  });
});

// Desktop version endpoint (Day 3 task, scaffolded now)
app.get('/api/desktop/version', (req, res) => {
  res.json({
    minimum: '1.0.0',
    latest: '1.0.0',
    downloadUrl: 'https://github.com/YOUR_USERNAME/threadverse/releases',
  });
});

// ── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

// ── Start ────────────────────────────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
  });
});

module.exports = app; // for Jest tests