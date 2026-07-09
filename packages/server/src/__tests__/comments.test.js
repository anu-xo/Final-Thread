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

describe('POST/GET /api/posts/:id/comments', () => {
  let testUser;
  let testCommunity;
  let testPost;
  let authToken;

  beforeAll(async () => {
    while (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    testUser = await User.create({
      username: 'commenter',
      email: 'commenter@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });

    testCommunity = await Community.create({
      name: 'Comments Community',
      slug: 'comments-community',
      description: 'For comment tests',
      createdBy: testUser._id,
      members: 1,
    });

    testPost = await Post.create({
      title: 'Comment Test Post',
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
    await Comment.deleteMany({ author: testUser?._id });
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

  it('creates and returns a nested comment tree with correct depths', async () => {
    const createComment = async (parentId = null, body = 'comment') =>
      request(app)
        .post(`/api/posts/${testPost._id}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ body, parentId });

    const rootRes = await createComment(null, 'root comment');
    expect(rootRes.status).toBe(201);
    const rootComment = rootRes.body.data;
    expect(rootComment.depth).toBe(0);

    const childRes = await createComment(rootComment._id, 'child comment');
    expect(childRes.status).toBe(201);
    const childComment = childRes.body.data;
    expect(childComment.depth).toBe(1);

    const grandchildRes = await createComment(childComment._id, 'grandchild comment');
    expect(grandchildRes.status).toBe(201);
    const grandchildComment = grandchildRes.body.data;
    expect(grandchildComment.depth).toBe(2);

    const listRes = await request(app).get(`/api/posts/${testPost._id}/comments`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);

    const treeRoot = listRes.body.data[0];
    expect(treeRoot._id).toBe(rootComment._id);
    expect(treeRoot.depth).toBe(0);
    expect(treeRoot.children).toHaveLength(1);

    const treeChild = treeRoot.children[0];
    expect(treeChild._id).toBe(childComment._id);
    expect(treeChild.depth).toBe(1);
    expect(treeChild.children).toHaveLength(1);

    const treeGrandchild = treeChild.children[0];
    expect(treeGrandchild._id).toBe(grandchildComment._id);
    expect(treeGrandchild.depth).toBe(2);
    expect(treeGrandchild.children).toHaveLength(0);
  });

  it('enforces depth cap of 5 levels', async () => {
    const createComment = async (parentId = null, body = 'comment') =>
      request(app)
        .post(`/api/posts/${testPost._id}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ body, parentId });

    const buildChain = async (parentId, body) => {
      const res = await createComment(parentId, body);
      expect(res.status).toBe(201);
      return res.body.data;
    };

    let current = await buildChain(null, 'depth-0');
    for (let i = 1; i <= 5; i += 1) {
      current = await buildChain(current._id, `depth-${i}`);
      expect(current.depth).toBe(i);
    }

    const tooDeep = await createComment(current._id, 'too deep');
    expect(tooDeep.status).toBe(400);
    expect(tooDeep.body.error).toMatch(/depth/i);
  });

  it('rejects empty or whitespace-only comment body', async () => {
    const res1 = await request(app)
      .post(`/api/posts/${testPost._id}/comments`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ body: '', parentId: null });
    expect(res1.status).toBe(400);
    expect(res1.body.error).toMatch(/required/i);

    const res2 = await request(app)
      .post(`/api/posts/${testPost._id}/comments`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ body: '   ', parentId: null });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toMatch(/required/i);
  });

  it('rejects comment on non-existent post', async () => {
    const fakePostId = '507f1f77bcf86cd799439011';

    const res = await request(app)
      .post(`/api/posts/${fakePostId}/comments`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ body: 'test comment', parentId: null });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('rejects parent comment from a different post', async () => {
    const otherPost = await Post.create({
      title: 'Other Post',
      body: 'Test body',
      author: testUser._id,
      community: testCommunity._id,
    });

    const parentRes = await request(app)
      .post(`/api/posts/${otherPost._id}/comments`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ body: 'comment on other post', parentId: null });
    expect(parentRes.status).toBe(201);
    const parentComment = parentRes.body.data;

    const res = await request(app)
      .post(`/api/posts/${testPost._id}/comments`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ body: 'reply', parentId: parentComment._id });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/different post/i);
  });

  it('rejects invalid parent comment ID', async () => {
    const res = await request(app)
      .post(`/api/posts/${testPost._id}/comments`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ body: 'test comment', parentId: 'not-a-valid-id' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid parent/i);
  });

  it('rejects reply to non-existent parent comment', async () => {
    const fakeParentId = '507f1f77bcf86cd799439011';

    const res = await request(app)
      .post(`/api/posts/${testPost._id}/comments`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ body: 'test comment', parentId: fakeParentId });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Parent comment not found/i);
  });

  it('increments post commentCount when comment is created', async () => {
    const postBefore = await Post.findById(testPost._id);
    const countBefore = postBefore.commentCount || 0;

    const res = await request(app)
      .post(`/api/posts/${testPost._id}/comments`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ body: 'test comment for count', parentId: null });

    expect(res.status).toBe(201);

    const postAfter = await Post.findById(testPost._id);
    expect(postAfter.commentCount).toBe(countBefore + 1);
  });
});