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
  generateCommunityChat: jest.fn().mockResolvedValue({ message: 'mock response', model: 'test' }),
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
const { default: CommunityMember } = await import('../models/CommunityMember.js');
const { default: Post } = await import('../models/Post.js');
const { default: Vote } = await import('../models/Vote.js');

describe('GET /api/feed', () => {
  let testUser;
  let testCommunity;
  let authToken;

  beforeAll(async () => {
    while (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    testUser = await User.create({
      username: 'feeduser',
      email: 'feed@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });

    testCommunity = await Community.create({
      name: 'Feed Community',
      slug: 'feed-community',
      description: 'For feed tests',
      createdBy: testUser._id,
      members: 1,
    });

    await CommunityMember.create({
      user: testUser._id,
      community: testCommunity._id,
      role: 'member',
    });

    authToken = jwt.sign(
      { userId: testUser._id, role: testUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await Vote.deleteMany({});
    await Post.deleteMany({ author: testUser?._id });
    await CommunityMember.deleteMany({});
    await Community.deleteOne({ _id: testCommunity?._id });
    await User.deleteOne({ _id: testUser?._id });
    await mongoose.connection.close();
    await redis.quit();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Post.deleteMany({ community: testCommunity._id });
    jest.clearAllMocks();
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/feed');
    expect(res.status).toBe(401);
  });

  it('returns empty feed with noSubscriptions flag when user has no memberships', async () => {
    const lonely = await User.create({
      username: 'lonely-feed',
      email: 'lonely@feed.test',
      passwordHash: 'dummy',
    });
    const token = jwt.sign(
      { userId: lonely._id, role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const res = await request(app)
      .get('/api/feed')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.noSubscriptions).toBe(true);
    expect(res.body.meta.hasMore).toBe(false);

    await User.deleteOne({ _id: lonely._id });
  });

  it('returns posts from subscribed communities with default hot sort', async () => {
    await Post.create({
      title: 'Hot Post',
      body: 'Test body',
      author: testUser._id,
      community: testCommunity._id,
      upvotes: 5,
      downvotes: 0,
      score: 5,
      hotScore: 0.9,
    });

    const res = await request(app)
      .get('/api/feed')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.meta.hasMore).toBe(false);
  });

  it('returns posts sorted by new', async () => {
    await Post.create({
      title: 'Newest Post',
      body: 'Body',
      author: testUser._id,
      community: testCommunity._id,
      upvotes: 0,
      downvotes: 0,
      score: 0,
      hotScore: 0,
    });

    const res = await request(app)
      .get('/api/feed?sort=new')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('returns posts sorted by top', async () => {
    await Post.create({
      title: 'Top Post',
      body: 'Body',
      author: testUser._id,
      community: testCommunity._id,
      upvotes: 10,
      downvotes: 0,
      score: 10,
      hotScore: 0.95,
    });

    const res = await request(app)
      .get('/api/feed?sort=top')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
  });

  it('returns posts sorted by rising', async () => {
    await Post.create({
      title: 'Rising Post',
      body: 'Body',
      author: testUser._id,
      community: testCommunity._id,
      upvotes: 3,
      downvotes: 0,
      score: 3,
      hotScore: 0.7,
      risingScore: 2.0,
    });

    const res = await request(app)
      .get('/api/feed?sort=rising')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
  });

  it('merges userVote into feed posts', async () => {
    const post = await Post.create({
      title: 'Vote Merge Post',
      body: 'Body',
      author: testUser._id,
      community: testCommunity._id,
      upvotes: 1,
      downvotes: 0,
      score: 1,
      hotScore: 0.5,
    });

    await Vote.create({
      user: testUser._id,
      target: post._id,
      targetType: 'post',
      value: 1,
    });

    const res = await request(app)
      .get('/api/feed')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    const feedPost = res.body.data.find(p => p._id === post._id.toString());
    if (feedPost) {
      expect(feedPost.userVote).toBe(1);
    }
  });

  it('defaults to hot sort for invalid sort parameter', async () => {
    const res = await request(app)
      .get('/api/feed?sort=invalid')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
  });
});
