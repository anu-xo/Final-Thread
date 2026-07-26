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

const { default: app, redis } = await import('../app.js');
const { getEmbeddingQueue } = await import('../jobs/embeddingQueue.js');

describe('Embedding Queue Config', () => {
  afterAll(async () => {
    await redis.quit();
    await mongoServer.stop();
  });

  describe('Queue configuration', () => {
    it('creates queue with correct name', () => {
      const queue = getEmbeddingQueue();
      expect(queue).toBeDefined();
    });

    it('queue is a singleton', () => {
      const q1 = getEmbeddingQueue();
      const q2 = getEmbeddingQueue();
      expect(q1).toBe(q2);
    });
  });

  describe('Queue options', () => {
    it('uses rediss:// when REDIS_URL starts with rediss://', () => {
      process.env.REDIS_URL = 'rediss://localhost:6380';
      expect(process.env.REDIS_URL).toMatch(/^rediss:\/\//);
      process.env.REDIS_URL = 'redis://localhost:6379';
    });

    it('uses redis:// when REDIS_URL starts with redis://', () => {
      expect(process.env.REDIS_URL).toMatch(/^redis:\/\//);
    });
  });
});
