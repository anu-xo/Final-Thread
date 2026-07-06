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

  it('creates and returns a nested comment tree, and rejects deeper replies', async () => {
    const createComment = async (parentId = null, body = 'comment') =>
      request(app)
        .post(`/api/posts/${testPost._id}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ body, parentId });

    const rootRes = await createComment(null, 'root comment');
    expect(rootRes.status).toBe(201);
    const rootComment = rootRes.body.data;

    const childRes = await createComment(rootComment._id, 'child comment');
    expect(childRes.status).toBe(201);
    const childComment = childRes.body.data;

    const grandchildRes = await createComment(childComment._id, 'grandchild comment');
    expect(grandchildRes.status).toBe(201);

    const listRes = await request(app).get(`/api/posts/${testPost._id}/comments`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0]._id).toBe(rootComment._id);
    expect(listRes.body.data[0].depth).toBe(0);
    expect(listRes.body.data[0].children[0].depth).toBe(1);
    expect(listRes.body.data[0].children[0].children[0].depth).toBe(2);

    const buildChain = async (parentId, body) => {
      const res = await createComment(parentId, body);
      expect(res.status).toBe(201);
      return res.body.data;
    };

    let current = rootComment;
    for (let i = 1; i <= 5; i += 1) {
      current = await buildChain(current._id, `depth-${i}`);
    }

    const tooDeep = await createComment(current._id, 'too deep');
    expect(tooDeep.status).toBe(400);
    expect(tooDeep.body.error).toMatch(/depth/);
  });
});
