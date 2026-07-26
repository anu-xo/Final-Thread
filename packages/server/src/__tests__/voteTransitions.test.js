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
const { computeHotScore } = await import('../utils/scoring.js');

async function createVoteRequest(authToken, payload) {
  return request(app)
    .post('/api/votes')
    .set('Authorization', `Bearer ${authToken}`)
    .send(payload);
}

describe('Independent Vote Transitions', () => {
  let testUser;
  let testCommunity;
  let authToken;

  beforeAll(async () => {
    while (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    testUser = await User.create({
      username: 'transition-voter',
      email: 'transition-voter@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });

    testCommunity = await Community.create({
      name: 'Transition Community',
      slug: 'transition-community',
      description: 'For transition tests',
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
    await Vote.deleteMany({ user: testUser?._id });
    await Post.deleteMany({ author: testUser?._id });
    await Community.deleteOne({ _id: testCommunity?._id });
    await User.deleteOne({ _id: testUser?._id });

    await mongoose.connection.close();
    await redis.quit();
    await mongoServer.stop();
  });

  beforeEach(() => {
    app.set('io', null);
    jest.clearAllMocks();
  });

  async function createFreshPost() {
    return Post.create({
      title: `Vote Transition Post ${Date.now()}-${Math.random()}`,
      body: 'Test body',
      author: testUser._id,
      community: testCommunity._id,
      upvotes: 0,
      downvotes: 0,
      score: 0,
      hotScore: 0,
    });
  }

  async function verifyPostState(postId, expected) {
    const post = await Post.findById(postId);
    expect(post.score).toBe(expected.score);
    expect(post.upvotes).toBe(expected.upvotes);
    expect(post.downvotes).toBe(expected.downvotes);

    const expectedHotScore = computeHotScore(
      expected.upvotes,
      expected.downvotes,
      post.createdAt
    );
    expect(post.hotScore).toBeCloseTo(expectedHotScore, 10);
    return post;
  }

  async function verifyVoteDoc(userId, targetId, expectedValue) {
    const voteDoc = await Vote.findOne({
      user: userId,
      target: targetId,
      targetType: 'post',
    });

    if (expectedValue === null) {
      expect(voteDoc).toBeNull();
    } else {
      expect(voteDoc).not.toBeNull();
      expect(voteDoc.value).toBe(expectedValue);
      expect(String(voteDoc.user)).toBe(String(userId));
      expect(String(voteDoc.target)).toBe(String(targetId));
      expect(voteDoc.targetType).toBe('post');
    }
  }

  it('no vote → upvote: score=1, upvotes=1, downvotes=0, Vote doc value=1', async () => {
    const post = await createFreshPost();

    const res = await createVoteRequest(authToken, {
      targetId: post._id,
      targetType: 'post',
      value: 1,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(1);
    expect(res.body.data.userVote).toBe(1);

    await verifyPostState(post._id, { score: 1, upvotes: 1, downvotes: 0 });
    await verifyVoteDoc(testUser._id, post._id, 1);
  });

  it('no vote → downvote: score=-1, upvotes=0, downvotes=1, Vote doc value=-1', async () => {
    const post = await createFreshPost();

    const res = await createVoteRequest(authToken, {
      targetId: post._id,
      targetType: 'post',
      value: -1,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(-1);
    expect(res.body.data.userVote).toBe(-1);

    await verifyPostState(post._id, { score: -1, upvotes: 0, downvotes: 1 });
    await verifyVoteDoc(testUser._id, post._id, -1);
  });

  it('up → down: score delta = -2, upvotes=1, downvotes=1, Vote doc value=-1', async () => {
    const post = await createFreshPost();

    await createVoteRequest(authToken, {
      targetId: post._id,
      targetType: 'post',
      value: 1,
    });

    const res = await createVoteRequest(authToken, {
      targetId: post._id,
      targetType: 'post',
      value: -1,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(-1);
    expect(res.body.data.userVote).toBe(-1);

    await verifyPostState(post._id, { score: -1, upvotes: 1, downvotes: 1 });
    await verifyVoteDoc(testUser._id, post._id, -1);
  });

  it('down → up: score delta = +2, upvotes=1, downvotes=1, Vote doc value=1', async () => {
    const post = await createFreshPost();

    await createVoteRequest(authToken, {
      targetId: post._id,
      targetType: 'post',
      value: -1,
    });

    const res = await createVoteRequest(authToken, {
      targetId: post._id,
      targetType: 'post',
      value: 1,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(1);
    expect(res.body.data.userVote).toBe(1);

    await verifyPostState(post._id, { score: 1, upvotes: 1, downvotes: 1 });
    await verifyVoteDoc(testUser._id, post._id, 1);
  });

  it('up → no vote: score delta = -1, upvotes=0, downvotes=0, Vote doc deleted', async () => {
    const post = await createFreshPost();

    await createVoteRequest(authToken, {
      targetId: post._id,
      targetType: 'post',
      value: 1,
    });

    const res = await createVoteRequest(authToken, {
      targetId: post._id,
      targetType: 'post',
      value: 1,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(0);
    expect(res.body.data.userVote).toBe(0);

    await verifyPostState(post._id, { score: 0, upvotes: 0, downvotes: 0 });
    await verifyVoteDoc(testUser._id, post._id, null);
  });

  it('down → no vote: score delta = +1, upvotes=0, downvotes=0, Vote doc deleted', async () => {
    const post = await createFreshPost();

    await createVoteRequest(authToken, {
      targetId: post._id,
      targetType: 'post',
      value: -1,
    });

    const res = await createVoteRequest(authToken, {
      targetId: post._id,
      targetType: 'post',
      value: -1,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(0);
    expect(res.body.data.userVote).toBe(0);

    await verifyPostState(post._id, { score: 0, upvotes: 0, downvotes: 0 });
    await verifyVoteDoc(testUser._id, post._id, null);
  });
});
