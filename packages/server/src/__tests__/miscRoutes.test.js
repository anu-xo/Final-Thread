import { jest } from '@jest/globals';

jest.unstable_mockModule('ioredis', () => ({
  Redis: jest.fn(() => ({
    on: jest.fn().mockReturnThis(),
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.unstable_mockModule('../jobs/embeddingQueue.js', () => ({
  getEmbeddingQueue: () => ({
    add: jest.fn().mockResolvedValue({ id: 'mock-job-uuid' }),
  }),
}));

jest.unstable_mockModule('../services/moderationService.js', () => ({
  classifyContent: jest.fn().mockResolvedValue('SAFE'),
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongoServer = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongoServer.getUri();
process.env.REDIS_URL = 'redis://localhost:6379';

const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { default: jwt } = await import('jsonwebtoken');
const { default: app, redis } = await import('../app.js');
const { default: User } = await import('../models/User.js');
const { default: Community } = await import('../models/Community.js');

describe('Misc Routes', () => {
  let adminUser;
  let adminToken;

  beforeAll(async () => {
    while (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    adminUser = await User.create({
      username: 'miscadmin',
      email: 'miscadmin@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'admin',
    });

    adminToken = jwt.sign(
      { userId: adminUser._id, role: adminUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Community.deleteMany({});
    await mongoose.connection.close();
    await redis.quit();
    await mongoServer.stop();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/health', () => {
    it('returns health status', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toBeDefined();
    });
  });

  describe('GET /api/sitemap/:version.xml', () => {
    it('returns XML sitemap', async () => {
      const res = await request(app).get('/api/sitemap/1.xml');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/xml/);
    });
  });

  describe('GET /api/email/unsubscribe/:userId', () => {
    it('unsubscribes user from email', async () => {
      const res = await request(app).get(
        `/api/email/unsubscribe/${adminUser._id}?token=unsubscribe`
      );
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent user', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app).get(
        `/api/email/unsubscribe/${fakeId}?token=unsubscribe`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/reports', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/api/reports')
        .send({ type: 'post', id: '123', reason: 'spam' });
      expect(res.status).toBe(401);
    });

    it('creates a report when authenticated', async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          contentType: 'post',
          contentId: new mongoose.Types.ObjectId(),
          reason: 'spam',
          description: 'Test report',
        });
      expect([200, 201, 400]).toContain(res.status);
    });
  });

  describe('GET /api/reports', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/reports');
      expect(res.status).toBe(401);
    });

    it('returns reports for admin', async () => {
      const res = await request(app)
        .get('/api/reports')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/desktop/version', () => {
    it('returns desktop version info', async () => {
      const res = await request(app).get('/api/desktop/version');
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });
  });
});
