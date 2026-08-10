import { jest } from '@jest/globals';

const neoQueueAdd = jest.fn().mockResolvedValue({ id: 'mock-summary-job-uuid' });

const mockEmbeddingQueue = {
  add: jest.fn().mockResolvedValue({ id: 'mock-embedding-job-uuid' }),
};

const mockNeoQueue = {
  add: neoQueueAdd,
};

const mockRedis = {
  on: jest.fn().mockReturnThis(),
  ping: jest.fn().mockResolvedValue('PONG'),
  quit: jest.fn().mockResolvedValue(undefined),
  incr: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
};

const mockIo = {
  to: jest.fn().mockReturnValue({ emit: jest.fn() }),
};

jest.unstable_mockModule('ioredis', () => ({
  Redis: jest.fn(() => mockRedis),
}));

jest.unstable_mockModule('../jobs/embeddingQueue.js', () => ({
  getEmbeddingQueue: () => mockEmbeddingQueue,
}));

jest.unstable_mockModule('../jobs/neoAutonomousQueue.js', () => ({
  getNeoAutonomousQueue: () => mockNeoQueue,
}));

jest.unstable_mockModule('../socket.js', () => ({
  getIO: () => mockIo,
  initIO: jest.fn(),
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
const { default: Comment } = await import('../models/Comment.js');
const { default: Notification } = await import('../models/Notification.js');

describe('POST /posts/:id/summarize', () => {
  let author;
  let mod;
  let member;
  let admin;
  let testCommunity;
  let testPost;
  let modToken;
  let memberToken;
  let adminToken;

  async function signToken(user) {
    return jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });
  }

  beforeAll(async () => {
    while (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    author = await User.create({
      username: 'summaryAuthor',
      email: 'summaryAuthor@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });
    mod = await User.create({
      username: 'summaryMod',
      email: 'summaryMod@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });
    member = await User.create({
      username: 'summaryMember',
      email: 'summaryMember@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });
    admin = await User.create({
      username: 'summaryAdmin',
      email: 'summaryAdmin@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'admin',
    });

    testCommunity = await Community.create({
      name: 'Summary Community',
      slug: 'summary-community',
      description: 'For summary tests',
      createdBy: author._id,
      members: 1,
    });

    await CommunityMember.create([
      { user: mod._id, community: testCommunity._id, role: 'mod' },
      { user: member._id, community: testCommunity._id, role: 'member' },
    ]);

    testPost = await Post.create({
      title: 'Summary Test Post',
      body: 'Test body',
      author: author._id,
      community: testCommunity._id,
    });

    modToken = await signToken(mod);
    memberToken = await signToken(member);
    adminToken = await signToken(admin);
  });

  afterAll(async () => {
    await Notification.deleteMany({});
    await CommunityMember.deleteMany({ community: testCommunity?._id });
    await Comment.deleteMany({ post: testPost?._id });
    await Post.deleteOne({ _id: testPost?._id });
    await Community.deleteOne({ _id: testCommunity?._id });
    await User.deleteMany({
      _id: { $in: [author?._id, mod?._id, member?._id, admin?._id] },
    });

    await mongoose.connection.close();
    await redis.quit();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Notification.deleteMany({});
    await Comment.deleteMany({ post: testPost?._id });
    jest.clearAllMocks();
    neoQueueAdd.mockResolvedValue({ id: 'mock-summary-job-uuid' });
  });

  async function summarizeAs(token, postId = testPost?._id) {
    return request(app)
      .post(`/api/posts/${postId}/summarize`)
      .set('Authorization', `Bearer ${token}`);
  }

  it('lets a community mod enqueue a summary job with the post community context', async () => {
    const res = await summarizeAs(modToken);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ queued: true });
    expect(res.body.error).toBeNull();

    expect(neoQueueAdd).toHaveBeenCalledTimes(1);
    expect(neoQueueAdd).toHaveBeenCalledWith(
      'summary',
      expect.objectContaining({
        postId: String(testPost._id),
        communityId: String(testCommunity._id),
        requestingUserId: String(mod._id),
      })
    );
  });

  it('lets a site admin enqueue even without a community membership', async () => {
    const res = await summarizeAs(adminToken);

    expect(res.status).toBe(200);
    expect(neoQueueAdd).toHaveBeenCalledTimes(1);
    expect(neoQueueAdd).toHaveBeenCalledWith(
      'summary',
      expect.objectContaining({ requestingUserId: String(admin._id) })
    );
  });

  it('rejects a plain member with 403', async () => {
    const res = await summarizeAs(memberToken);

    expect(res.status).toBe(403);
    expect(neoQueueAdd).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).post(`/api/posts/${testPost._id}/summarize`);

    expect(res.status).toBe(401);
    expect(neoQueueAdd).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing post', async () => {
    const missingId = new mongoose.Types.ObjectId();
    const res = await summarizeAs(modToken, missingId);

    expect(res.status).toBe(404);
    expect(neoQueueAdd).not.toHaveBeenCalled();
  });

  it('returns 409 and does not queue when the thread already has a summary', async () => {
    await Comment.create({
      body: 'Pinned summary',
      author: author._id,
      post: testPost._id,
      parent: null,
      depth: 0,
      isNeo: true,
      neoTrigger: 'summary',
      isPinned: true,
    });

    const res = await summarizeAs(modToken);

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already summarized');
    expect(neoQueueAdd).not.toHaveBeenCalled();
  });

  it('allows re-summarizing once the previous summary is removed', async () => {
    await Comment.create({
      body: 'Removed summary',
      author: author._id,
      post: testPost._id,
      parent: null,
      depth: 0,
      isNeo: true,
      neoTrigger: 'summary',
      isPinned: true,
      isRemoved: true,
    });

    const res = await summarizeAs(modToken);

    expect(res.status).toBe(200);
    expect(neoQueueAdd).toHaveBeenCalledTimes(1);
  });
});
