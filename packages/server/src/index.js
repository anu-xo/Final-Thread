import http from 'http';
import { Server } from 'socket.io';
import * as Sentry from '@sentry/node';
import app from './app.js';
import { initIO } from './socket.js';
import CORS_ORIGINS from './config/corsOrigins.js';

const PORT = process.env.PORT || 5000;

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
  Sentry.captureException(err, { level: 'fatal' });
  Sentry.flush(5000).finally(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
  const err = reason instanceof Error ? reason : new Error(String(reason));
  Sentry.captureException(err, { level: 'fatal' });
  Sentry.flush(5000).finally(() => process.exit(1));
});

// ── HTTP & Socket.io Server Setup ───────────────────────────────────────────
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin(origin, callback) {
      console.log('[Socket CORS] incoming origin:', origin);
      if (!origin || CORS_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    credentials: true,
  },
});

app.set('io', io);
initIO(io);

io.on('connection', (socket) => {
  console.log(`🔌 [Socket.io] Client connected: ${socket.id}`);

  // Auto-join personal notification room if socket auth middleware set socket.user
  if (socket.user?.id) {
    socket.join('user:' + socket.user.id);
  }

  socket.on('join_post', ({ postId }) => {
    if (!postId) return;
    socket.join(`post:${postId}`);
    console.log(`🧩 [Socket.io] ${socket.id} joined room post:${postId}`);
  });

  socket.on('leave_post', ({ postId }) => {
    if (!postId) return;
    socket.leave(`post:${postId}`);
  });

  socket.on('join_user', ({ userId }) => {
    if (!userId) return;
    socket.join(`user:${userId}`);
    console.log(`🔔 [Socket.io] ${socket.id} joined room user:${userId}`);
  });

  socket.on('leave_user', ({ userId }) => {
    if (!userId) return;
    socket.leave(`user:${userId}`);
  });

  socket.on('join_community', ({ slug }) => {
    if (!slug) return;
    socket.join(`community:${slug}`);
    console.log(`🪡 [Socket.io] ${socket.id} joined room community:${slug}`);
  });

  socket.on('leave_community', ({ slug }) => {
    if (!slug) return;
    socket.leave(`community:${slug}`);
  });

  socket.on('disconnect', () => {
    console.log(`❌ [Socket.io] Client disconnected: ${socket.id}`);
  });
});

// ── Start ────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, async () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
  const { default: embeddingWorker } = await import('./jobs/embeddingWorker.js');
  console.log('[Server] Embedding worker started');

  if (process.env.NODE_ENV !== 'test' && !global.__evalCronScheduled) {
    global.__evalCronScheduled = true;
    const evalCron = await import('./jobs/evalCron.js');
    evalCron.scheduleNightlyEval();

    const digestCron = await import('./jobs/digestCron.js');
    digestCron.registerDigestCron();

    console.log('[Server] Nightly eval cron scheduled');
    console.log('[Server] Weekly digest cron scheduled');
  }
});

export { app, httpServer };
