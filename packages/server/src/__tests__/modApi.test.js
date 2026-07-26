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
const { default: CommunityMember } = await import('../models/CommunityMember.js');

describe('Mod API', () => {
  let adminUser;
  let modUser;
  let regularUser;
  let adminToken;
  let modToken;
  let regularToken;
  let testCommunity;
  let testPost;

  beforeAll(async () => {
    while (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    adminUser = await User.create({
      username: 'modadmin',
      email: 'modadmin@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'admin',
    });

    modUser = await User.create({
      username: 'modmod',
      email: 'modmod@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });

    regularUser = await User.create({
      username: 'modregular',
      email: 'modregular@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });

    testCommunity = await Community.create({
      name: 'Mod Test Community',
      slug: 'mod-test-comm',
      description: 'Mod tests',
      createdBy: adminUser._id,
      members: 1,
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

    await CommunityMember.create({
      user: regularUser._id,
      community: testCommunity._id,
      role: 'member',
    });

    testPost = await Post.create({
      title: 'Mod Test Post',
      body: 'Post to moderate',
      author: regularUser._id,
      community: testCommunity._id,
      upvotes: 1,
      downvotes: 0,
      score: 1,
      hotScore: 0.5,
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
    await Post.deleteMany({});
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

  describe('Authorization', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const res = await request(app).get(`/api/mod/${testCommunity.slug}/queue`);
      expect(res.status).toBe(401);
    });

    it('returns 403 for non-mod users', async () => {
      const res = await request(app)
        .get(`/api/mod/${testCommunity.slug}/queue`)
        .set('Authorization', `Bearer ${regularToken}`);
      expect(res.status).toBe(403);
    });

    it('allows community mods', async () => {
      const res = await request(app)
        .get(`/api/mod/${testCommunity.slug}/queue`)
        .set('Authorization', `Bearer ${modToken}`);
      expect(res.status).toBe(200);
    });

    it('allows platform admins', async () => {
      const res = await request(app)
        .get(`/api/mod/${testCommunity.slug}/queue`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/mod/:slug/queue', () => {
    it('returns pending posts for the community', async () => {
      const res = await request(app)
        .get(`/api/mod/${testCommunity.slug}/queue`)
        .set('Authorization', `Bearer ${modToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('returns 404 for non-existent community', async () => {
      const res = await request(app)
        .get('/api/mod/fakecomm/queue')
        .set('Authorization', `Bearer ${modToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/mod/:slug/approve/:postId', () => {
    it('approves a pending post', async () => {
      const res = await request(app)
        .post(`/api/mod/${testCommunity.slug}/approve/${testPost._id}`)
        .set('Authorization', `Bearer ${modToken}`);
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent post', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post(`/api/mod/${testCommunity.slug}/approve/${fakeId}`)
        .set('Authorization', `Bearer ${modToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/mod/:slug/remove/:postId', () => {
    it('removes a pending post', async () => {
      const res = await request(app)
        .post(`/api/mod/${testCommunity.slug}/remove/${testPost._id}`)
        .set('Authorization', `Bearer ${modToken}`)
        .send({ reason: 'Test removal' });
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent post', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post(`/api/mod/${testCommunity.slug}/remove/${fakeId}`)
        .set('Authorization', `Bearer ${modToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/mod/:slug/ban-member/:userId', () => {
    it('bans a community member', async () => {
      const res = await request(app)
        .post(`/api/mod/${testCommunity.slug}/ban-member/${regularUser._id}`)
        .set('Authorization', `Bearer ${modToken}`)
        .send({ reason: 'Test ban' });
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent member', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post(`/api/mod/${testCommunity.slug}/ban-member/${fakeId}`)
        .set('Authorization', `Bearer ${modToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/mod/:slug/unban-member/:userId', () => {
    it('unbans a community member', async () => {
      await CommunityMember.findOneAndUpdate(
        { user: regularUser._id, community: testCommunity._id },
        { role: 'banned' }
      );

      const res = await request(app)
        .post(`/api/mod/${testCommunity.slug}/unban-member/${regularUser._id}`)
        .set('Authorization', `Bearer ${modToken}`);
      expect(res.status).toBe(200);

      await CommunityMember.findOneAndUpdate(
        { user: regularUser._id, community: testCommunity._id },
        { role: 'member' }
      );
    });

    it('returns 404 for non-existent member', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post(`/api/mod/${testCommunity.slug}/unban-member/${fakeId}`)
        .set('Authorization', `Bearer ${modToken}`);
      expect(res.status).toBe(404);
    });
  });
});
