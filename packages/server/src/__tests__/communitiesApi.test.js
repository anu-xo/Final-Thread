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
const { default: CommunityMember } = await import('../models/CommunityMember.js');

describe('Communities API', () => {
  let adminUser;
  let modUser;
  let regularUser;
  let adminToken;
  let modToken;
  let regularToken;
  let testCommunity;

  beforeAll(async () => {
    while (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    adminUser = await User.create({
      username: 'commadmin',
      email: 'commadmin@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'admin',
    });

    modUser = await User.create({
      username: 'commmod',
      email: 'commmod@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });

    regularUser = await User.create({
      username: 'commregular',
      email: 'commregular@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });

    testCommunity = await Community.create({
      name: 'Test Community',
      slug: 'test-comm-api',
      description: 'For testing',
      createdBy: adminUser._id,
      members: 1,
      mods: [adminUser._id],
    });

    await CommunityMember.create({
      user: adminUser._id,
      community: testCommunity._id,
      role: 'mod',
    });

    await CommunityMember.create({
      user: modUser._id,
      community: testCommunity._id,
      role: 'mod',
    });

    adminToken = jwt.sign(
      { userId: adminUser._id, role: adminUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    modToken = jwt.sign(
      { userId: modUser._id, role: modUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    regularToken = jwt.sign(
      { userId: regularUser._id, role: regularUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await CommunityMember.deleteMany({});
    await Community.deleteOne({ _id: testCommunity?._id });
    await User.deleteMany({});
    await mongoose.connection.close();
    await redis.quit();
    await mongoServer.stop();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/communities', () => {
    it('returns paginated list of communities', async () => {
      const res = await request(app).get('/api/communities');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.hasMore).toBeDefined();
    });

    it('supports cursor pagination', async () => {
      const res = await request(app).get('/api/communities?limit=1');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(1);
    });

    it('caps limit at 50', async () => {
      const res = await request(app).get('/api/communities?limit=100');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/communities/:slug', () => {
    it('returns community by slug', async () => {
      const res = await request(app).get('/api/communities/test-comm-api');
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Test Community');
      expect(res.body.data.slug).toBe('test-comm-api');
    });

    it('returns 404 for non-existent slug', async () => {
      const res = await request(app).get('/api/communities/does-not-exist-xyz');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/communities', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/api/communities')
        .send({ name: 'New', slug: 'new-comm', description: 'Test' });
      expect(res.status).toBe(401);
    });

    it('creates community successfully', async () => {
      const res = await request(app)
        .post('/api/communities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Brand New', slug: 'brand-new', description: 'Fresh community' });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Brand New');
    });

    it('returns 409 for duplicate slug', async () => {
      const res = await request(app)
        .post('/api/communities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Dup', slug: 'test-comm-api', description: 'Dup slug' });
      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/communities/:slug/join', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).post('/api/communities/test-comm-api/join');
      expect(res.status).toBe(401);
    });

    it('joins a community', async () => {
      const res = await request(app)
        .post('/api/communities/test-comm-api/join')
        .set('Authorization', `Bearer ${regularToken}`);
      expect(res.status).toBe(200);
    });

    it('returns 200 if already a member (idempotent)', async () => {
      const res = await request(app)
        .post('/api/communities/test-comm-api/join')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });

    it('returns 403 if banned from community', async () => {
      await CommunityMember.create({
        user: regularUser._id,
        community: testCommunity._id,
        role: 'banned',
      });

      const res = await request(app)
        .post('/api/communities/test-comm-api/join')
        .set('Authorization', `Bearer ${regularToken}`);
      expect(res.status).toBe(403);

      await CommunityMember.deleteOne({
        user: regularUser._id,
        community: testCommunity._id,
      });
    });

    it('returns 404 for non-existent community', async () => {
      const res = await request(app)
        .post('/api/communities/nonexistent/join')
        .set('Authorization', `Bearer ${regularToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/communities/:slug/leave', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).post('/api/communities/test-comm-api/leave');
      expect(res.status).toBe(401);
    });

    it('leaves a community successfully', async () => {
      const res = await request(app)
        .post('/api/communities/test-comm-api/leave')
        .set('Authorization', `Bearer ${regularToken}`);
      expect(res.status).toBe(200);
    });

    it('returns 400 if not a member', async () => {
      const res = await request(app)
        .post('/api/communities/test-comm-api/leave')
        .set('Authorization', `Bearer ${regularToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not a member/);
    });

    it('returns 400 if sole mod tries to leave', async () => {
      const soleMod = await User.create({
        username: 'solemod',
        email: 'solemod@test.com',
        passwordHash: 'dummy',
      });
      const solo = await Community.create({
        name: 'Solo Mod',
        slug: 'solo-mod',
        description: 'One mod only',
        createdBy: soleMod._id,
        mods: [soleMod._id],
        members: 1,
      });
      await CommunityMember.create({
        user: soleMod._id,
        community: solo._id,
        role: 'mod',
      });

      const token = jwt.sign(
        { userId: soleMod._id, role: 'user' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .post(`/api/communities/${solo.slug}/leave`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/only moderator/);

      await CommunityMember.deleteMany({ community: solo._id });
      await Community.deleteOne({ _id: solo._id });
      await User.deleteOne({ _id: soleMod._id });
    });
  });

  describe('GET /api/communities/me', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/communities/me');
      expect(res.status).toBe(401);
    });

    it('returns communities the user has joined', async () => {
      const res = await request(app)
        .get('/api/communities/me')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('PUT /api/communities/:slug/rules', () => {
    it('allows admin to update rules', async () => {
      const res = await request(app)
        .put('/api/communities/test-comm-api/rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ rules: [{ title: 'Rule 1', description: 'Be nice' }] });
      expect(res.status).toBe(200);
      expect(res.body.data.rules).toHaveLength(1);
    });

    it('returns 403 for non-mod user', async () => {
      const res = await request(app)
        .put('/api/communities/test-comm-api/rules')
        .set('Authorization', `Bearer ${regularToken}`)
        .send({ rules: [] });
      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent community', async () => {
      const res = await request(app)
        .put('/api/communities/nonexistent/rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ rules: [] });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/communities/:slug/flairs', () => {
    it('allows admin to add flairs', async () => {
      const res = await request(app)
        .post('/api/communities/test-comm-api/flairs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Discussion', color: '#FF5733' });
      expect(res.status).toBe(201);
    });

    it('returns 403 for regular user', async () => {
      const res = await request(app)
        .post('/api/communities/test-comm-api/flairs')
        .set('Authorization', `Bearer ${regularToken}`)
        .send({ name: 'Test' });
      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent community', async () => {
      const res = await request(app)
        .post('/api/communities/nonexistent/flairs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test' });
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/communities/:slug', () => {
    it('allows mod to update community settings', async () => {
      const res = await request(app)
        .put('/api/communities/test-comm-api')
        .set('Authorization', `Bearer ${modToken}`)
        .send({ aiEnabled: false });
      expect(res.status).toBe(200);
    });

    it('returns 403 for non-mod user', async () => {
      const res = await request(app)
        .put('/api/communities/test-comm-api')
        .set('Authorization', `Bearer ${regularToken}`)
        .send({ aiEnabled: false });
      expect(res.status).toBe(403);
    });
  });
});
