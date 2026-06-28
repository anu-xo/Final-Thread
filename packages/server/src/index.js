const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const mongoose = require('mongoose');
const { Redis } = require('ioredis');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// ── HTTP & Socket.io Server Setup ───────────────────────────────────────────
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: [
      'http://localhost:5173',  // Vite dev server
      'electron://'             // Electron renderer
    ],
    credentials: true,
  },
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log(`🔌 [Socket.io] Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`❌ [Socket.io] Client disconnected: ${socket.id}`);
  });
});

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:5173',
    'electron://'
  ],
  credentials: true,
}));
app.use(morgan('dev'));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── MongoDB Connection ──────────────────────────────────────────────────────
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      directConnection: true,
    });
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
};

// ── Redis Connection ────────────────────────────────────────────────────────
const redis = new Redis(process.env.REDIS_URL, {
  tls: {},
  maxRetriesPerRequest: 1,
  retryStrategy: (times) => {
    if (times > 3) return null;
    return Math.min(times * 200, 1000);
  },
});

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => console.error('❌ Redis error:', err.message));

app.set('redis', redis);

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/auth', authRoutes);

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

// ── Start (only when run directly, not when imported by tests) ───────────────
if (require.main === module) {
  connectDB().then(() => {
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
      console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
      require('./jobs/embeddingWorker.js');
      console.log('[Server] Embedding worker started');
    });
  });
}

// ── Exports (app for Jest tests, httpServer for graceful shutdown etc.) ───────
module.exports = { app, httpServer };