import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import cookieParser from 'cookie-parser';
import * as Sentry from '@sentry/node';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import CORS_ORIGINS from './config/corsOrigins.js';
import swaggerOptions from './config/swagger.js';

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
import adminRoutes from './routes/admin.js';
import sitemapRoutes from './routes/sitemap.js';
import desktopRoutes from './routes/desktop.js';
import emailRoutes from './routes/email.js';
import { adminRouter } from './middleware/adminGuard.js';
import { platformTag } from './middleware/platformTag.js';
import { versionGate } from './middleware/versionGate.js';
import { sanitizeError } from './utils/sanitizeError.js';
import { sendWeeklyDigest } from './services/emailService.js';

console.log("script start");
// ── ESM Paths Configuration ──────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
app.set('io', null);

// ── Sentry (must be before any other middleware) ─────────────────────────────
const SENTRY_DSN = process.env.SENTRY_DSN || process.env.VITE_SENTRY_DSN;
if (SENTRY_DSN && SENTRY_DSN.startsWith('https://') && SENTRY_DSN.includes('@') && !SENTRY_DSN.includes('your-key') && !SENTRY_DSN.includes('your-project')) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  });
}

// ── Request ID ───────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const id = req.headers['x-request-id'] || randomUUID();
  req.requestId = id;
  res.setHeader('x-request-id', id);
  Sentry.setTag('request_id', id);
  next();
});

// ── Security & Logging Middleware ──────────────────────────────────────────
app.use(
  helmet({
    // ── Content-Security-Policy ────────────────────────────────────────────
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
        fontSrc: ["'self'"],
        connectSrc: [
          "'self'",
          'https://api.threadverse.app',
          'wss://api.threadverse.app',
          'https://api.cloudinary.com',
          'https://*.sentry.io',
        ],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },

    // ── HSTS (2 years + includeSubDomains + preload) ──────────────────────
    hsts: {
      maxAge: 63072000,
      includeSubDomains: true,
      preload: true,
    },

    // ── X-Frame-Options ───────────────────────────────────────────────────
    frameguard: { action: 'deny' },

    // ── Referrer-Policy ───────────────────────────────────────────────────
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

// ── Permissions-Policy (Helmet 7.x dropped built-in support) ─────────────
app.use((req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
  );
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      console.log('[CORS] incoming origin:', origin);
      if (!origin || CORS_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    credentials: true,
  })
);

// ── Platform Tag (desktop vs web) ───────────────────────────────────────────
app.use(platformTag);

morgan.token('platform', (req) => req.platform || 'unknown');
morgan.token('appVersion', (req) => req.appVersion || '-');
morgan.token('requestId', (req) => req.requestId || '-');
app.use(morgan(':method :url :status :res[content-length] - :response-time ms [id=:requestId platform=:platform version=:appVersion]'));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Mongoose Debug Logging ───────────────────────────────────────────────────
// Enable with MONGOOSE_DEBUG=true for the load-test window; off by default in prod.
if (process.env.MONGOOSE_DEBUG === 'true') {
  mongoose.set('debug', true);
  console.log('🔍 Mongoose debug logging enabled');
}

// ── MongoDB Connection ──────────────────────────────────────────────────────
const connectDB = async () => {
  try {
    const isProduction = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: isProduction ? 10 : undefined,
      ssl: isProduction ? true : undefined,
      authSource: isProduction ? 'admin' : undefined,
      directConnection: isProduction ? true : undefined,
      serverSelectionTimeoutMS: 5000,
    });
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
// Swagger docs — gated behind API_DOCS_ENABLED env flag.
//   staging:  set API_DOCS_ENABLED=true  → docs accessible at /api/docs
//   production: env not set → 404 (API surface not exposed publicly)
// All docs responses include X-Robots-Tag: noindex to exclude from search engines.
const docsEnabled = process.env.API_DOCS_ENABLED === 'true';

if (docsEnabled) {
  const swaggerSpec = swaggerJsdoc(swaggerOptions);

  // noindex header on every docs response
  app.use('/api/docs', (req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'ThreadVerse API Docs',
  }));
  app.get('/api/docs.json', (req, res) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.json(swaggerSpec);
  });
} else {
  // Production: return 404 for docs routes
  app.use('/api/docs', (req, res) => res.status(404).json({ data: null, error: 'Not found', meta: null }));
  app.get('/api/docs.json', (req, res) => res.status(404).json({ data: null, error: 'Not found', meta: null }));
}

// Ungated — health & version must stay reachable for outdated clients.
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
app.use('/api/desktop', desktopRoutes);
app.use('/api/email', emailRoutes);

// ── Version Gate ────────────────────────────────────────────────────────────
app.use(versionGate);

// Gated routes below ─────────────────────────────────────────────────────────
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
app.use('/api/admin', adminRouter, adminRoutes);

// ── Debug echo (used by integration tests to verify platformTag) ─────────────
app.get('/api/debug/platform', (req, res) => {
  res.json({ data: { platform: req.platform, appVersion: req.appVersion }, error: null, meta: null });
});

// ── Debug: trigger weekly digest manually (remove before shipping) ───────────
app.post('/api/debug/test-digest', adminRouter, async (req, res) => {
  try {
    const result = await sendWeeklyDigest();
    res.json({ data: result, error: null, meta: null });
  } catch (err) {
    console.error('[debug/test-digest] error:', err);
    res.status(500).json({ data: null, error: sanitizeError(err, 'Digest failed'), meta: null });
  }
});

// ── Sitemap (mounted at / so crawlers find /sitemap.xml) ─────────────────────
app.use('/', sitemapRoutes);

// ── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ data: null, error: 'Not found', meta: null });
});

// ── Sentry Express error handler (must be after routes, before custom error handlers) ──
Sentry.setupExpressErrorHandler(app);

// ── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(`[id=${req.requestId}]`, err.stack);
  res.status(err.status || 500).json({
    data: null,
    error: sanitizeError(err, 'Internal server error'),
    meta: null,
  });
});

export { redis };
export default app;