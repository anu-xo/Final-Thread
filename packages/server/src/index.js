import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import communityRoutes from './routes/communities.js';

// __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// ── HTTP & Socket.io Server Setup ───────────────────────────────────────────
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'electron://'],
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
app.use(cors({ origin: ['http://localhost:5173', 'electron://'], credentials: true }));
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
app.use('/api/auth', authRoutes);
app.use('/api/communities', communityRoutes);
app.get('/api/health', async (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  let redisStatus = 'disconnected';
  try {
    await redis.ping();
    redisStatus = 'connected';
  } catch {
    redisStatus = 'disconnected';
  }
  res.json({ status: 'ok', db: dbStatus, redis: redisStatus, timestamp: new Date().toISOString() });
});

app.get('/api/desktop/version', (req, res) => {
  res.json({ minimum: '1.0.0', latest: '1.0.0', downloadUrl: 'https://github.com/YOUR_USERNAME/threadverse/releases' });
});

// ── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// ── Start ────────────────────────────────────────────────────────────────────
connectDB().then(async () => {
  httpServer.listen(PORT, async () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
    const { default: embeddingWorker } = await import('./jobs/embeddingWorker.js');
    console.log('[Server] Embedding worker started');
  });
});

// ── Exports (for Jest tests) ─────────────────────────────────────────────────
export { app, httpServer };
