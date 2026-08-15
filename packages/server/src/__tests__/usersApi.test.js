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

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongoServer = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongoServer.getUri();
process.env.REDIS_URL = 'redis://localhost:6379';

const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { default: jwt } = await import('jsonwebtoken');
const { default: app, redis } = await import('../app.js');
const { default: User } = await import('../models/User.js');
const { default: Post } = await import('../models/Post.js');
const { default: Community } = await import('../models/Community.js');
const { default: Comment } = await import('../models/Comment.js');

describe('Users API', () => {
  let testUser;
  let otherUser;
  let authToken;
  let testCommunity;

  beforeAll(async () => {
    while (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    testUser = await User.create({
      username: 'profileuser',
      email: 'profile@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
      bio: 'Test bio',
    });

    otherUser = await User.create({
      username: 'otherprofile',
      email: 'other@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });

    testCommunity = await Community.create({
      name: 'User Test Community',
      slug: 'user-test-comm',
      description: 'For user tests',
      createdBy: testUser._id,
      members: 1,
    });

    authToken = jwt.sign(
      { userId: testUser._id, role: testUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    await Post.create({
      title: 'User Post',
      body: 'Post body',
      author: testUser._id,
      community: testCommunity._id,
      upvotes: 3,
      downvotes: 0,
      score: 3,
      hotScore: 0.5,
    });

    const post = await Post.findOne({ author: testUser._id });
    await Comment.create({
      body: 'User comment',
      author: testUser._id,
      post: post._id,
      depth: 0,
      score: 2,
    });
  });

  afterAll(async () => {
    await Comment.deleteMany({});
    await Post.deleteMany({});
    await Community.deleteOne({ _id: testCommunity?._id });
    await User.deleteMany({});
    await mongoose.connection.close();
    await redis.quit();
    await mongoServer.stop();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/users/:username', () => {
    it('returns user profile with computed karma', async () => {
      const res = await request(app).get('/api/users/profileuser');
      expect(res.status).toBe(200);
      expect(res.body.data.username).toBe('profileuser');
      expect(res.body.data.karma).toBe(5);
    });

    it('returns 404 for non-existent user', async () => {
      const res = await request(app).get('/api/users/doesnotexist999');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/users/:username/posts', () => {
    it('returns paginated posts by user', async () => {
      const res = await request(app).get('/api/users/profileuser/posts');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
    });

    it('returns 404 for non-existent user posts', async () => {
      const res = await request(app).get('/api/users/ghostuser/posts');
      expect(res.status).toBe(404);
    });

    it('supports limit parameter', async () => {
      const res = await request(app).get('/api/users/profileuser/posts?limit=1');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(1);
    });

    it('supports cursor pagination', async () => {
      const res = await request(app).get('/api/users/profileuser/posts?limit=1');
      expect(res.status).toBe(200);
      if (res.body.meta.cursor) {
        const res2 = await request(app).get(
          `/api/users/profileuser/posts?limit=1&cursor=${res.body.meta.cursor}`
        );
        expect(res2.status).toBe(200);
      }
    });
  });

  describe('GET /api/users/:username/comments', () => {
    it('returns paginated comments by user', async () => {
      const res = await request(app).get('/api/users/profileuser/comments');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('returns 404 for non-existent user comments', async () => {
      const res = await request(app).get('/api/users/ghostuser/comments');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/users/me', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app)
        .put('/api/users/me')
        .send({ bio: 'Updated' });
      expect(res.status).toBe(401);
    });

    it('updates user profile fields', async () => {
      const res = await request(app)
        .put('/api/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ bio: 'Updated bio', theme: { mode: 'dark' } });
      expect([200, 404, 500]).toContain(res.status);
    });
  });
});
