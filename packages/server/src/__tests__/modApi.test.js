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
const { default: Post } = await import('../models/Post.js');
const { default: Community } = await import('../models/Community.js');
const { default: CommunityMember } = await import('../models/CommunityMember.js');
const { default: Report } = await import('../models/Report.js');

describe('Mod API', () => {
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
    await Report.deleteMany({});
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

  describe('GET /api/mod/queue', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const res = await request(app).get('/api/mod/queue');
      expect(res.status).toBe(401);
    });

    it('returns empty queue for non-mod users', async () => {
      const res = await request(app)
        .get('/api/mod/queue')
        .set('Authorization', `Bearer ${regularToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns pending reports for mod communities', async () => {
      const res = await request(app)
        .get('/api/mod/queue')
        .set('Authorization', `Bearer ${modToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('allows platform admins', async () => {
      const res = await request(app)
        .get('/api/mod/queue')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });

    it('filters by communityId when provided', async () => {
      const res = await request(app)
        .get(`/api/mod/queue?communityId=${testCommunity._id}`)
        .set('Authorization', `Bearer ${modToken}`);
      expect(res.status).toBe(200);
    });

    it('returns 403 when filtering by community user does not mod', async () => {
      const otherComm = await Community.create({
        name: 'Other', slug: 'other-mod-test', description: 'x', createdBy: regularUser._id, members: 1,
      });
      const res = await request(app)
        .get(`/api/mod/queue?communityId=${otherComm._id}`)
        .set('Authorization', `Bearer ${modToken}`);
      expect(res.status).toBe(403);
      await Community.deleteOne({ _id: otherComm._id });
    });
  });

  describe('POST /api/mod/action', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const res = await request(app)
        .post('/api/mod/action')
        .send({ type: 'approve' });
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid action type', async () => {
      const res = await request(app)
        .post('/api/mod/action')
        .set('Authorization', `Bearer ${modToken}`)
        .send({ type: 'invalid', targetType: 'post' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when ban has no userId', async () => {
      const res = await request(app)
        .post('/api/mod/action')
        .set('Authorization', `Bearer ${modToken}`)
        .send({ type: 'ban', targetType: 'post', communityId: testCommunity._id });
      expect(res.status).toBe(400);
    });

    it('handles approve action', async () => {
      const postId = new mongoose.Types.ObjectId();
      await Post.create({
        _id: postId, title: 'Reported', body: 'body', author: regularUser._id,
        community: testCommunity._id, upvotes: 0, downvotes: 0, score: 0, hotScore: 0,
      });
      const report = await Report.create({
        reporter: regularUser._id,
        community: testCommunity._id,
        targetType: 'post',
        target: postId,
        reason: 'spam',
      });
      const res = await request(app)
        .post('/api/mod/action')
        .set('Authorization', `Bearer ${modToken}`)
        .send({
          type: 'approve',
          targetType: 'post',
          communityId: testCommunity._id,
          reportId: report._id,
        });
      expect(res.status).toBe(200);
    });

    it('handles remove action', async () => {
      const post = await Post.create({
        title: 'To Remove', body: 'body', author: regularUser._id, community: testCommunity._id,
        upvotes: 0, downvotes: 0, score: 0, hotScore: 0,
      });
      const res = await request(app)
        .post('/api/mod/action')
        .set('Authorization', `Bearer ${modToken}`)
        .send({
          type: 'remove',
          targetType: 'post',
          targetId: post._id,
          communityId: testCommunity._id,
        });
      expect(res.status).toBe(200);
    });

    it('handles ban action', async () => {
      const res = await request(app)
        .post('/api/mod/action')
        .set('Authorization', `Bearer ${modToken}`)
        .send({
          type: 'ban',
          targetType: 'post',
          userId: regularUser._id,
          communityId: testCommunity._id,
          reason: 'Test ban',
        });
      expect(res.status).toBe(200);

      await CommunityMember.findOneAndUpdate(
        { user: regularUser._id, community: testCommunity._id },
        { role: 'member' }
      );
    });
  });
});
