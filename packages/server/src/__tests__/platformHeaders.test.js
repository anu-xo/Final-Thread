import { jest } from '@jest/globals';

const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'mock-job-uuid' }),
};

const mockRedis = {
  on: jest.fn().mockReturnThis(),
  ping: jest.fn().mockResolvedValue('PONG'),
  quit: jest.fn().mockResolvedValue(undefined),
};

jest.unstable_mockModule('../jobs/embeddingQueue.js', () => ({
  getEmbeddingQueue: () => mockQueue,
}));

jest.unstable_mockModule('ioredis', () => ({
  Redis: jest.fn(() => mockRedis),
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.NODE_ENV = 'test';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongoServer = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongoServer.getUri();
process.env.REDIS_URL = 'redis://localhost:6379';

const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { default: app } = await import('../app.js');

describe('Platform headers & CORS', () => {
  beforeAll(async () => {
    while (mongoose.connection.readyState !== 1) {
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
    await mongoServer.stop();
  });

  // ── platformTag middleware ────────────────────────────────────────────────

  describe('req.platform resolution', () => {
    it('resolves to "desktop" when X-App-Platform is "electron"', async () => {
      const res = await request(app)
        .get('/api/debug/platform')
        .set('X-App-Platform', 'electron')
        .set('X-App-Version', '1.0.0');

      expect(res.status).toBe(200);
      expect(res.body.platform).toBe('desktop');
      expect(res.body.appVersion).toBe('1.0.0');
    });

    it('resolves to "web" when X-App-Platform header is absent', async () => {
      const res = await request(app).get('/api/debug/platform');

      expect(res.status).toBe(200);
      expect(res.body.platform).toBe('web');
      expect(res.body.appVersion).toBeNull();
    });

    it('resolves to "web" when X-App-Platform is an unexpected value', async () => {
      const res = await request(app)
        .get('/api/debug/platform')
        .set('X-App-Platform', 'ios');

      expect(res.status).toBe(200);
      expect(res.body.platform).toBe('web');
    });
  });

  // ── CORS ─────────────────────────────────────────────────────────────────

  describe('CORS origin allowlist', () => {
    it('allows electron://. origin (desktop production)', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'electron://.');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('electron://.');
    });

    it('allows http://localhost:5173 (dev / desktop dev)', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:5173');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('blocks an unrecognized origin', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'https://evil.com');

      expect(res.status).toBe(500);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
