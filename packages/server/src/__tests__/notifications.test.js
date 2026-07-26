import { jest } from '@jest/globals';

const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'mock-job-uuid' }),
};

const mockRedis = {
  on: jest.fn().mockReturnThis(),
  ping: jest.fn().mockResolvedValue('PONG'),
  quit: jest.fn().mockResolvedValue(undefined),
};

const mockIo = {
  to: jest.fn().mockReturnValue({ emit: jest.fn() }),
};

jest.unstable_mockModule('../jobs/embeddingQueue.js', () => ({
  getEmbeddingQueue: () => mockQueue,
}));

jest.unstable_mockModule('ioredis', () => ({
  Redis: jest.fn(() => mockRedis),
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
const { default: Post } = await import('../models/Post.js');
const { default: Comment } = await import('../models/Comment.js');
const { default: Notification } = await import('../models/Notification.js');

describe('Notification Trigger Conditions', () => {
  let authorA;
  let commenterB;
  let mentionedC;
  let testCommunity;
  let testPost;
  let tokenA;
  let tokenB;

  beforeAll(async () => {
    while (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    authorA = await User.create({
      username: 'authorA',
      email: 'authorA@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });

    commenterB = await User.create({
      username: 'commenterB',
      email: 'commenterB@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });

    mentionedC = await User.create({
      username: 'mentionedC',
      email: 'mentionedC@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });

    testCommunity = await Community.create({
      name: 'Notification Community',
      slug: 'notification-community',
      description: 'For notification tests',
      createdBy: authorA._id,
      members: 1,
    });

    testPost = await Post.create({
      title: 'Notification Test Post',
      body: 'Test body',
      author: authorA._id,
      community: testCommunity._id,
    });

    tokenA = jwt.sign(
      { userId: authorA._id, role: authorA.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    tokenB = jwt.sign(
      { userId: commenterB._id, role: commenterB.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await Notification.deleteMany({});
    await Comment.deleteMany({ post: testPost?._id });
    await Post.deleteOne({ _id: testPost?._id });
    await Community.deleteOne({ _id: testCommunity?._id });
    await User.deleteMany({ _id: { $in: [authorA?._id, commenterB?._id, mentionedC?._id] } });

    await mongoose.connection.close();
    await redis.quit();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Notification.deleteMany({});
    jest.clearAllMocks();
  });

  async function createCommentAs(token, body, parentId = null) {
    return request(app)
      .post(`/api/posts/${testPost._id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body, parentId });
  }

  // ── Reply notifications ────────────────────────────────────────────────────

  describe('Reply notifications', () => {
    it('fires when parentComment.author !== commenter', async () => {
      const parentRes = await createCommentAs(tokenA, 'parent comment by authorA');
      expect(parentRes.status).toBe(21);
      const parentComment = parentRes.body.data;

      const replyRes = await createCommentAs(tokenB, 'reply by commenterB', parentComment._id);
      expect(replyRes.status).toBe(201);

      const notifications = await Notification.find({
        user: authorA._id,
        type: 'reply',
      });

      expect(notifications).toHaveLength(1);
      expect(String(notifications[0].actor)).toBe(String(commenterB._id));
      expect(String(notifications[0].target)).toBe(String(replyRes.body.data._id));
      expect(notifications[0].targetType).toBe('Comment');
      expect(notifications[0].read).toBe(false);
    });

    it('does NOT fire when replying to your own comment (parentComment.author === commenter)', async () => {
      const parentRes = await createCommentAs(tokenA, 'authorA own comment');
      expect(parentRes.status).toBe(201);
      const parentComment = parentRes.body.data;

      const selfReplyRes = await createCommentAs(tokenA, 'authorA replies to self', parentComment._id);
      expect(selfReplyRes.status).toBe(201);

      const notifications = await Notification.find({
        user: authorA._id,
        type: 'reply',
      });

      expect(notifications).toHaveLength(0);
    });
  });

  // ── @mention notifications ─────────────────────────────────────────────────

  describe('@mention notifications', () => {
    it('fires for existing usernames mentioned in comment body', async () => {
      const res = await createCommentAs(tokenB, `hello @${mentionedC.username}, great post!`);
      expect(res.status).toBe(201);

      const notifications = await Notification.find({
        user: mentionedC._id,
        type: 'mention',
      });

      expect(notifications).toHaveLength(1);
      expect(String(notifications[0].actor)).toBe(String(commenterB._id));
      expect(String(notifications[0].target)).toBe(String(res.body.data._id));
      expect(notifications[0].targetType).toBe('Comment');
    });

    it('does NOT fire for non-existent usernames', async () => {
      const res = await createCommentAs(tokenB, 'hello @doesnotexist12345, nice!');
      expect(res.status).toBe(201);

      const notifications = await Notification.find({ type: 'mention' });
      expect(notifications).toHaveLength(0);
    });

    it('does NOT create self-mention notification when mentioning yourself', async () => {
      const res = await createCommentAs(tokenB, `@${commenterB.username} agrees with this`);
      expect(res.status).toBe(201);

      const notifications = await Notification.find({
        user: commenterB._id,
        type: 'mention',
      });

      expect(notifications).toHaveLength(0);
    });

    it('fires for multiple distinct mentioned users', async () => {
      const res = await createCommentAs(
        tokenB,
        `@${authorA.username} and @${mentionedC.username} check this out`
      );
      expect(res.status).toBe(201);

      const notifA = await Notification.find({
        user: authorA._id,
        type: 'mention',
      });
      const notifC = await Notification.find({
        user: mentionedC._id,
        type: 'mention',
      });

      expect(notifA).toHaveLength(1);
      expect(notifC).toHaveLength(1);
    });
  });

  // ── Combined reply + mention ───────────────────────────────────────────────

  describe('Combined reply + mention', () => {
    it('creates both reply and mention notifications when replying to another user with a mention', async () => {
      const parentRes = await createCommentAs(tokenA, 'original comment');
      expect(parentRes.status).toBe(201);
      const parentComment = parentRes.body.data;

      const res = await createCommentAs(
        tokenB,
        `@${mentionedC.username} see this reply`,
        parentComment._id
      );
      expect(res.status).toBe(201);

      const replyNotifs = await Notification.find({
        user: authorA._id,
        type: 'reply',
      });
      const mentionNotifs = await Notification.find({
        user: mentionedC._id,
        type: 'mention',
      });

      expect(replyNotifs).toHaveLength(1);
      expect(mentionNotifs).toHaveLength(1);
    });

    it('creates only reply notification (no mention) when replying without @mentioning anyone', async () => {
      const parentRes = await createCommentAs(tokenA, 'root comment');
      expect(parentRes.status).toBe(201);

      const res = await createCommentAs(tokenB, 'just a regular reply', parentRes.body.data._id);
      expect(res.status).toBe(201);

      const allNotifs = await Notification.find({});
      const replyNotifs = allNotifs.filter(n => n.type === 'reply');
      const mentionNotifs = allNotifs.filter(n => n.type === 'mention');

      expect(replyNotifs).toHaveLength(1);
      expect(mentionNotifs).toHaveLength(0);
    });
  });

  // ── Socket.io emission ─────────────────────────────────────────────────────

  describe('Socket.io notification push', () => {
    it('emits notification:new to the recipient user room', async () => {
      const parentRes = await createCommentAs(tokenA, 'root for socket test');
      expect(parentRes.status).toBe(201);

      await createCommentAs(tokenB, 'reply for socket test', parentRes.body.data._id);

      expect(mockIo.to).toHaveBeenCalledWith(`user:${authorA._id}`);
      expect(mockIo.to().emit).toHaveBeenCalledWith(
        'notification:new',
        expect.objectContaining({
          type: 'reply',
          actor: expect.any(mongoose.Types.ObjectId),
        })
      );
    });
  });

  // ── Edge: no notifications for root comment without mentions ───────────────

  describe('No notification edge cases', () => {
    it('creates no notifications for a root comment with no mentions', async () => {
      const res = await createCommentAs(tokenA, 'just a root comment, no mentions');
      expect(res.status).toBe(201);

      const notifications = await Notification.find({});
      expect(notifications).toHaveLength(0);
    });

    it('creates no notifications when a root comment mentions only non-existent users', async () => {
      const res = await createCommentAs(tokenA, '@ghost1 @ghost2 nobody here');
      expect(res.status).toBe(201);

      const notifications = await Notification.find({});
      expect(notifications).toHaveLength(0);
    });
  });
});
