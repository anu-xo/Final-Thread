import { jest } from '@jest/globals';

const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'mock-job-uuid' }),
};

jest.unstable_mockModule('../jobs/embeddingQueue.js', () => ({
  getEmbeddingQueue: () => mockQueue,
}));

const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { default: jwt } = await import('jsonwebtoken');
const { default: app, redis } = await import('../app.js');
const { default: User } = await import('../models/User.js');
const { default: Community } = await import('../models/Community.js');
const { default: Post } = await import('../models/Post.js');
const { default: Comment } = await import('../models/Comment.js');
const { default: Vote } = await import('../models/Vote.js');

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
    await Comment.deleteMany({ post: testPost?._id });
    await Post.deleteMany({ _id: testPost?._id });
    await Community.deleteOne({ _id: testCommunity?._id });
    await User.deleteOne({ _id: testUser?._id });
    await mongoose.connection.close();
    await redis.quit();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('handles the six vote transitions correctly for posts', async () => {
    const vote = async (value) =>
      request(app)
        .post('/api/votes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ targetId: testPost._id, targetType: 'post', value });

    const res1 = await vote(1);
    expect(res1.status).toBe(200);
    expect(res1.body.data.score).toBe(1);
    expect(res1.body.data.userVote).toBe(1);

    const voteDoc1 = await Vote.findOne({ user: testUser._id, target: testPost._id, targetType: 'post' });
    expect(voteDoc1.value).toBe(1);

    const res2 = await vote(-1);
    expect(res2.status).toBe(200);
    expect(res2.body.data.score).toBe(-1);
    expect(res2.body.data.userVote).toBe(-1);

    const voteDoc2 = await Vote.findOne({ user: testUser._id, target: testPost._id, targetType: 'post' });
    expect(voteDoc2.value).toBe(-1);

    const res3 = await vote(1);
    expect(res3.status).toBe(200);
    expect(res3.body.data.score).toBe(1);
    expect(res3.body.data.userVote).toBe(1);

    const voteDoc3 = await Vote.findOne({ user: testUser._id, target: testPost._id, targetType: 'post' });
    expect(voteDoc3.value).toBe(1);

    const res4 = await vote(0);
    expect(res4.status).toBe(200);
    expect(res4.body.data.score).toBe(0);
    expect(res4.body.data.userVote).toBe(0);

    const voteDoc4 = await Vote.findOne({ user: testUser._id, target: testPost._id, targetType: 'post' });
    expect(voteDoc4).toBeNull();
  });

  it('emits vote updates for comment votes to the parent post room', async () => {
    const mockIo = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    };

    app.set('io', mockIo);

    const comment = await Comment.create({
      body: 'comment for vote room',
      author: testUser._id,
      post: testPost._id,
      depth: 0,
    });

    const res = await request(app)
      .post('/api/votes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetId: comment._id, targetType: 'comment', value: 1 });

    expect(res.status).toBe(200);
    expect(mockIo.to).toHaveBeenCalledWith(`post:${testPost._id}`);
  });
});
