import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import cookieParser from 'cookie-parser';

// Route Imports
import authRoutes from './routes/auth.js';
import communityRoutes from './routes/communities.js';
import feedRoutes from './routes/feed.js';
import postRoutes from "./routes/postRoutes.js";
import searchRoutes from './routes/search.js';
import userRoutes from './routes/users.js';
import voteRoutes from './routes/votes.js';
import uploadRoutes from './routes/upload.js';
import reportRoutes from './routes/reports.js'; // Added from update
import modRoutes from './routes/mod.js';       // Added from update
import aiRoutes from './routes/ai.js';
import notificationsRouter from './routes/notifications.js';
import { adminRouter } from './middleware/adminGuard.js';

console.log("script start");
// ── ESM Paths Configuration ──────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
app.set('io', null);

// ── Security & Logging Middleware ──────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", 'https://api.threadverse.app', 'wss://api.threadverse.app'],
        imgSrc: ["'self'", 'https://res.cloudinary.com', 'data:'],
        scriptSrc: ["'self'"],
      },
    },
    frameguard: { action: 'deny' },
  })
);

app.use(
  cors({
    origin: ['http://localhost:5173', 'electron://'],
    credentials: true
  })
);

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
    console.log("after connect");
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  }
};
connectDB();

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
app.use('/api/feed', feedRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/users', userRoutes);
app.use('/api/votes', voteRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/ai', aiRoutes); 

// Base-level routes mapping the updated endpoints matching your scheme
app.use('/api', reportRoutes);
app.use('/api', modRoutes);
app.use('/api/notifications', notificationsRouter);

// Admin routes — auth + role check applied once via adminRouter
// Mount your admin route files under this prefix:
//   import adminFooRoutes from './routes/admin/foo.js';
//   app.use('/api/admin/foo', adminRouter, adminFooRoutes);
app.use('/api/admin', adminRouter);

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
  res.json({ minimum: '1.0.0', latest: '1.0.0', downloadUrl: 'https://github.com/anu-xo/Final-Thread.git/releases' });
});

// ── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ status: 'ok', message: 'ThreadVerse API is running', docs: '/api/health' });
});

// ── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

export { redis };
export default app;