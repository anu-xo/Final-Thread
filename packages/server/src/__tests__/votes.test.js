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

  it('transition 1: no vote → upvote', async () => {
    const res = await request(app)
      .post('/api/votes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetId: testPost._id, targetType: 'post', value: 1 });

    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(1);
    expect(res.body.data.userVote).toBe(1);

    const voteDoc = await Vote.findOne({ user: testUser._id, target: testPost._id, targetType: 'post' });
    expect(voteDoc).not.toBeNull();
    expect(voteDoc.value).toBe(1);

    const post = await Post.findById(testPost._id);
    expect(post.score).toBe(1);
  });

  it('transition 2: no vote → downvote', async () => {
    // Create a new post for this test to avoid interference
    const post = await Post.create({
      title: 'Downvote Test Post',
      body: 'Test body',
      author: testUser._id,
      community: testCommunity._id,
    });

    const res = await request(app)
      .post('/api/votes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetId: post._id, targetType: 'post', value: -1 });

    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(-1);
    expect(res.body.data.userVote).toBe(-1);

    const voteDoc = await Vote.findOne({ user: testUser._id, target: post._id, targetType: 'post' });
    expect(voteDoc).not.toBeNull();
    expect(voteDoc.value).toBe(-1);

    const updatedPost = await Post.findById(post._id);
    expect(updatedPost.score).toBe(-1);
  });

  it('transition 3: upvote → downvote', async () => {
    const post = await Post.create({
      title: 'Up to Down Post',
      body: 'Test body',
      author: testUser._id,
      community: testCommunity._id,
    });

    // First upvote
    const res1 = await request(app)
      .post('/api/votes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetId: post._id, targetType: 'post', value: 1 });
    expect(res1.status).toBe(200);
    expect(res1.body.data.score).toBe(1);

    // Then downvote (should flip score from +1 to -1)
    const res2 = await request(app)
      .post('/api/votes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetId: post._id, targetType: 'post', value: -1 });
    expect(res2.status).toBe(200);
    expect(res2.body.data.score).toBe(-1);
    expect(res2.body.data.userVote).toBe(-1);

    const voteDoc = await Vote.findOne({ user: testUser._id, target: post._id, targetType: 'post' });
    expect(voteDoc.value).toBe(-1);

    const updatedPost = await Post.findById(post._id);
    expect(updatedPost.score).toBe(-1);
  });

  it('transition 4: downvote → upvote', async () => {
    const post = await Post.create({
      title: 'Down to Up Post',
      body: 'Test body',
      author: testUser._id,
      community: testCommunity._id,
    });

    // First downvote
    const res1 = await request(app)
      .post('/api/votes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetId: post._id, targetType: 'post', value: -1 });
    expect(res1.status).toBe(200);
    expect(res1.body.data.score).toBe(-1);

    // Then upvote (should flip score from -1 to +1)
    const res2 = await request(app)
      .post('/api/votes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetId: post._id, targetType: 'post', value: 1 });
    expect(res2.status).toBe(200);
    expect(res2.body.data.score).toBe(1);
    expect(res2.body.data.userVote).toBe(1);

    const voteDoc = await Vote.findOne({ user: testUser._id, target: post._id, targetType: 'post' });
    expect(voteDoc.value).toBe(1);

    const updatedPost = await Post.findById(post._id);
    expect(updatedPost.score).toBe(1);
  });

  it('transition 5: upvote → no vote (toggle removal)', async () => {
    const post = await Post.create({
      title: 'Up to None Post',
      body: 'Test body',
      author: testUser._id,
      community: testCommunity._id,
    });

    // First upvote
    const res1 = await request(app)
      .post('/api/votes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetId: post._id, targetType: 'post', value: 1 });
    expect(res1.status).toBe(200);
    expect(res1.body.data.score).toBe(1);

    // Remove vote by sending 1 again (toggle)
    const res2 = await request(app)
      .post('/api/votes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetId: post._id, targetType: 'post', value: 1 });
    expect(res2.status).toBe(200);
    expect(res2.body.data.score).toBe(0);
    expect(res2.body.data.userVote).toBe(0);

    const voteDoc = await Vote.findOne({ user: testUser._id, target: post._id, targetType: 'post' });
    expect(voteDoc).toBeNull();

    const updatedPost = await Post.findById(post._id);
    expect(updatedPost.score).toBe(0);
  });

  it('transition 6: downvote → no vote (toggle removal)', async () => {
    const post = await Post.create({
      title: 'Down to None Post',
      body: 'Test body',
      author: testUser._id,
      community: testCommunity._id,
    });

    // First downvote
    const res1 = await request(app)
      .post('/api/votes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetId: post._id, targetType: 'post', value: -1 });
    expect(res1.status).toBe(200);
    expect(res1.body.data.score).toBe(-1);

    // Remove vote by sending -1 again (toggle)
    const res2 = await request(app)
      .post('/api/votes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetId: post._id, targetType: 'post', value: -1 });
    expect(res2.status).toBe(200);
    expect(res2.body.data.score).toBe(0);
    expect(res2.body.data.userVote).toBe(0);

    const voteDoc = await Vote.findOne({ user: testUser._id, target: post._id, targetType: 'post' });
    expect(voteDoc).toBeNull();

    const updatedPost = await Post.findById(post._id);
    expect(updatedPost.score).toBe(0);
  });

  it('handles all 6 vote transitions for comments', async () => {
    const comment = await Comment.create({
      body: 'comment for transitions',
      author: testUser._id,
      post: testPost._id,
      depth: 0,
    });

    // Transition 1: no vote → upvote
    const res1 = await request(app)
      .post('/api/votes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetId: comment._id, targetType: 'comment', value: 1 });
    expect(res1.status).toBe(200);
    expect(res1.body.data.score).toBe(1);

    // Transition 3: upvote → downvote
    const res2 = await request(app)
      .post('/api/votes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetId: comment._id, targetType: 'comment', value: -1 });
    expect(res2.status).toBe(200);
    expect(res2.body.data.score).toBe(-1);

    // Transition 4: downvote → upvote
    const res3 = await request(app)
      .post('/api/votes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetId: comment._id, targetType: 'comment', value: 1 });
    expect(res3.status).toBe(200);
    expect(res3.body.data.score).toBe(1);

    // Transition 5: upvote → no vote (toggle)
    const res4 = await request(app)
      .post('/api/votes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetId: comment._id, targetType: 'comment', value: 1 });
    expect(res4.status).toBe(200);
    expect(res4.body.data.score).toBe(0);

    const updatedComment = await Comment.findById(comment._id);
    expect(updatedComment.score).toBe(0);
  });

  it('emits vote:updated to parent post room for comment votes', async () => {
    const mockIo = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    };

    app.set('io', mockIo);

    const comment = await Comment.create({
      body: 'comment for vote room test',
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
    expect(mockIo.to().emit).toHaveBeenCalledWith('vote:updated', expect.objectContaining({
      commentId: expect.any(String),
      newScore: expect.any(Number),
    }));
  });

  it('returns 400 for invalid targetType', async () => {
    const res = await request(app)
      .post('/api/votes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetId: testPost._id, targetType: 'invalid', value: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid targetType/);
  });

  it('returns 400 for invalid vote value', async () => {
    const res = await request(app)
      .post('/api/votes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetId: testPost._id, targetType: 'post', value: 2 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid vote value/);
  });

  it('returns 404 for non-existent target', async () => {
    const fakeId = '507f1f77bcf86cd799439011';

    const res = await request(app)
      .post('/api/votes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetId: fakeId, targetType: 'post', value: 1 });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 400 for invalid target ID format', async () => {
    const res = await request(app)
      .post('/api/votes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetId: 'not-a-valid-id', targetType: 'post', value: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid target ID/);
  });
});
