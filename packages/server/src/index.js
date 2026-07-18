import http from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import aiRoutes from './routes/ai.js';
import { initIO } from './socket.js';

app.use('/api/ai', aiRoutes);

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

    console.log('[Server] Nightly eval cron scheduled');
  }
});

export { app, httpServer };
