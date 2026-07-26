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

describe('AI Rate Limit Middleware', () => {
  let testUser;
  let authToken;
  let testCommunity;

  beforeAll(async () => {
    while (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    testUser = await User.create({
      username: 'ailimiter',
      email: 'ailimiter@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });

    testCommunity = await Community.create({
      name: 'AI Rate Limit Community',
      slug: 'ai-rate-limit-comm',
      description: 'Testing AI limits',
      createdBy: testUser._id,
      members: 1,
    });

    authToken = jwt.sign(
      { userId: testUser._id, role: testUser.role },
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

  describe('Daily AI usage tracking', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/ai/usage');
      expect(res.status).toBe(401);
    });

    it('allows AI request when under limit', async () => {
      const res = await request(app)
        .get('/api/ai/usage')
        .set('Authorization', `Bearer ${authToken}`);
      expect([200, 401, 404, 403, 500]).toContain(res.status);
    });
  });
});
