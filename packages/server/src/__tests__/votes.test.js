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
const { default: Comment } = await import('../models/Comment.js');
const { default: Vote } = await import('../models/Vote.js');

async function createVoteRequest(authToken, payload) {
  return request(app)
    .post('/api/votes')
    .set('Authorization', `Bearer ${authToken}`)
    .send(payload);
}

function expectVoteDocument(voteDoc, expectedValue, targetId, targetType, userId) {
  expect(voteDoc).not.toBeNull();
  expect(voteDoc.value).toBe(expectedValue);
  expect(String(voteDoc.target)).toBe(String(targetId));
  expect(voteDoc.targetType).toBe(targetType);
  expect(String(voteDoc.user)).toBe(String(userId));
}

describe('POST /api/votes', () => {
  let testUser;
  let testCommunity;
  let testPost;
  let authToken;

  beforeAll(async () => {
    while (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    testUser = await User.create({
      username: 'voter',
      email: 'voter@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });

    testCommunity = await Community.create({
      name: 'Voting Community',
      slug: 'voting-community',
      description: 'For vote tests',
      createdBy: testUser._id,
      members: 1,
    });

    testPost = await Post.create({
      title: 'Vote Test Post',
      body: 'Test body',
      author: testUser._id,
      community: testCommunity._id,
    });

    authToken = jwt.sign(
      { userId: testUser._id, role: testUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await Vote.deleteMany({ user: testUser?._id });
    await Comment.deleteMany({ author: testUser?._id });
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

  it('handles all 6 post vote transitions with correct scores and persisted Vote docs', async () => {
    const transitionChecks = [
      { label: 'no vote -> upvote', value: 1, expectedScore: 1, expectedVote: 1 },
      { label: 'upvote -> downvote', value: -1, expectedScore: -1, expectedVote: -1 },
      { label: 'downvote -> upvote', value: 1, expectedScore: 1, expectedVote: 1 },
      { label: 'upvote -> no vote', value: 1, expectedScore: 0, expectedVote: 0 },
      { label: 'no vote -> downvote', value: -1, expectedScore: -1, expectedVote: -1 },
      { label: 'downvote -> no vote', value: -1, expectedScore: 0, expectedVote: 0 },
    ];

    for (const [index, transition] of transitionChecks.entries()) {
      const response = await createVoteRequest(authToken, {
        targetId: testPost._id,
        targetType: 'post',
        value: transition.value,
      });

      expect(response.status).toBe(200);
      expect(response.body.data.score).toBe(transition.expectedScore);
      expect(response.body.data.userVote).toBe(transition.expectedVote);

      const post = await Post.findById(testPost._id);
      expect(post.score).toBe(transition.expectedScore);
      expect(post.hotScore).toBeGreaterThanOrEqual(0);
      expect(response.body.data.hotScore).toBeCloseTo(post.hotScore, 10);

      const voteDoc = await Vote.findOne({
        user: testUser._id,
        target: testPost._id,
        targetType: 'post',
      });

      if (transition.expectedVote === 0) {
        expect(voteDoc).toBeNull();
      } else {
        expectVoteDocument(voteDoc, transition.expectedVote, testPost._id, 'post', testUser._id);
      }

      if (index === 0) {
        expect(post.score).toBe(1);
      }
    }
  });

  it('votes on comments and emits to the parent post room', async () => {
    const mockEmit = jest.fn();
    const mockIo = {
      to: jest.fn().mockReturnValue({ emit: mockEmit }),
    };

    app.set('io', mockIo);

    const comment = await Comment.create({
      body: 'comment for vote room test',
      author: testUser._id,
      post: testPost._id,
      depth: 0,
    });

    const response = await createVoteRequest(authToken, {
      targetId: comment._id,
      targetType: 'comment',
      value: 1,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.score).toBe(1);
    expect(response.body.data.userVote).toBe(1);

    const voteDoc = await Vote.findOne({
      user: testUser._id,
      target: comment._id,
      targetType: 'comment',
    });
    expectVoteDocument(voteDoc, 1, comment._id, 'comment', testUser._id);

    const updatedComment = await Comment.findById(comment._id);
    expect(updatedComment.score).toBe(1);

    expect(mockIo.to).toHaveBeenCalledWith(`post:${testPost._id}`);
    expect(mockEmit).toHaveBeenCalledWith(
      'vote:updated',
      expect.objectContaining({
        commentId: expect.any(String),
        newScore: 1,
      })
    );
  });

  it('returns 400 for invalid targetType', async () => {
    const response = await createVoteRequest(authToken, {
      targetId: testPost._id,
      targetType: 'invalid',
      value: 1,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Invalid targetType/);
  });

  it('returns 400 for invalid vote value', async () => {
    const response = await createVoteRequest(authToken, {
      targetId: testPost._id,
      targetType: 'post',
      value: 2,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Invalid vote value/);
  });

  it('returns 404 for non-existent target', async () => {
    const response = await createVoteRequest(authToken, {
      targetId: '507f1f77bcf86cd799439011',
      targetType: 'post',
      value: 1,
    });

    expect(response.status).toBe(404);
    expect(response.body.error).toMatch(/not found/i);
  });

  it('returns 400 for invalid target ID format', async () => {
    const response = await createVoteRequest(authToken, {
      targetId: 'not-a-valid-id',
      targetType: 'post',
      value: 1,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Invalid target ID/);
  });
});
