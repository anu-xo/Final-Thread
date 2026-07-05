import http from 'http';
import { Server } from 'socket.io';
import app from './app.js';

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

  socket.on('join_post', ({ postId }) => {
    if (!postId) return;
    socket.join(`post:${postId}`);
    console.log(`🧩 [Socket.io] ${socket.id} joined room post:${postId}`);
  });

  socket.on('leave_post', ({ postId }) => {
    if (!postId) return;
    socket.leave(`post:${postId}`);
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
});

export { app, httpServer };
