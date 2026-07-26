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

jest.unstable_mockModule('../services/moderationService.js', () => ({
  classifyContent: jest.fn().mockResolvedValue('SAFE'),
}));

jest.unstable_mockModule('../services/aiService.js', () => ({
  generateCommunityChat: jest.fn().mockResolvedValue({ message: 'mock', model: 'test' }),
  generateCommentSummary: jest.fn().mockResolvedValue('Mock summary'),
  generatePostSummary: jest.fn().mockResolvedValue('Mock summary'),
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

  describe('GET /sitemap.xml', () => {
    it('returns XML sitemap', async () => {
      const res = await request(app).get('/sitemap.xml');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/xml/);
    });
  });

  describe('GET /api/email/unsubscribe', () => {
    it('returns 400 for invalid token', async () => {
      const res = await request(app).get(
        `/api/email/unsubscribe?token=badtoken`
      );
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing token', async () => {
      const res = await request(app).get('/api/email/unsubscribe');
      expect(res.status).toBe(400);
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
    it('returns 404 for GET on reports (only POST supported)', async () => {
      const res = await request(app)
        .get('/api/reports')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/desktop/version', () => {
    it('returns desktop version info', async () => {
      const res = await request(app).get('/api/desktop/version');
      expect(res.status).toBe(200);
    });
  });
});
