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

jest.unstable_mockModule('../services/aiService.js', () => ({
  generateCommunityChat: jest.fn().mockResolvedValue({ message: 'mock', model: 'test' }),
  generateCommentSummary: jest.fn().mockResolvedValue('Mock summary'),
  generatePostSummary: jest.fn().mockResolvedValue('Mock summary'),
  embedQuery: jest.fn().mockResolvedValue([0.1, 0.2]),
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

describe('AI Routes', () => {
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

  describe('GET /api/ai/health', () => {
    it('returns health status', async () => {
      const res = await request(app).get('/api/ai/health');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/ai/chat', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .send({ message: 'hello', communityId: testCommunity._id });
      expect(res.status).toBe(401);
    });

    it('returns 400 when message is missing', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ communityId: testCommunity._id });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/ai/conversations/:id/messages', () => {
    it('returns 401 without auth', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app).get(`/api/ai/conversations/${fakeId}/messages`);
      expect(res.status).toBe(401);
    });

    it('returns 404 for non-existent conversation', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/ai/conversations/${fakeId}/messages`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/ai/messages/:id/feedback', () => {
    it('returns 401 without auth', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post(`/api/ai/messages/${fakeId}/feedback`)
        .send({ rating: 1 });
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid rating', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post(`/api/ai/messages/${fakeId}/feedback`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ rating: 5 });
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent message', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post(`/api/ai/messages/${fakeId}/feedback`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ rating: 1 });
      expect(res.status).toBe(404);
    });
  });
});
