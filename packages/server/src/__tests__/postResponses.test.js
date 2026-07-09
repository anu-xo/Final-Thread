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
const { default: Community } = await import('../models/Community.js');
const { default: Post } = await import('../models/Post.js');
const { default: Vote } = await import('../models/Vote.js');

describe('GET /api/posts responses', () => {
  let testUser;
  let testCommunity;
  let votedPost;
  let otherPost;
  let authToken;

  beforeAll(async () => {
    while (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    testUser = await User.create({
      username: 'reader',
      email: 'reader@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });

    testCommunity = await Community.create({
      name: 'Posts Community',
      slug: 'posts-community',
      description: 'For post response tests',
      createdBy: testUser._id,
      members: 1,
    });

    votedPost = await Post.create({
      title: 'Voted Post',
      body: 'First body',
      author: testUser._id,
      community: testCommunity._id,
    });

    otherPost = await Post.create({
      title: 'Other Post',
      body: 'Second body',
      author: testUser._id,
      community: testCommunity._id,
    });

    await Vote.create({
      user: testUser._id,
      target: votedPost._id,
      targetType: 'post',
      value: 1,
    });

    authToken = jwt.sign(
      { userId: testUser._id, role: testUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await Vote.deleteMany({ user: testUser?._id });
    await Post.deleteMany({ author: testUser?._id });
    await Community.deleteOne({ _id: testCommunity?._id });
    await User.deleteOne({ _id: testUser?._id });

    await mongoose.connection.close();
    await redis.quit();
    await mongoServer.stop();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('includes userVote on the post list response for the authenticated viewer', async () => {
    const response = await request(app)
      .get('/api/posts')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(200);
    expect(response.body.posts).toHaveLength(2);

    const votedResponse = response.body.posts.find((post) => post._id === String(votedPost._id));
    const otherResponse = response.body.posts.find((post) => post._id === String(otherPost._id));

    expect(votedResponse.userVote).toBe(1);
    expect(otherResponse.userVote).toBe(0);
  });

  it('includes userVote on the single post response for the authenticated viewer', async () => {
    const response = await request(app)
      .get(`/api/posts/${votedPost._id}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(200);
    expect(response.body.post.userVote).toBe(1);
  });
});