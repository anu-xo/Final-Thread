import { jest } from '@jest/globals';

const neoQueueAdd = jest.fn().mockResolvedValue({ id: 'mock-neo-job-uuid' });

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

jest.unstable_mockModule('../jobs/embeddingQueue.js', () => ({
  getEmbeddingQueue: () => mockEmbeddingQueue,
}));

jest.unstable_mockModule('../jobs/neoAutonomousQueue.js', () => ({
  getNeoAutonomousQueue: () => mockNeoQueue,
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
const { detectNeoMention, stripNeoMention } = await import('../utils/neoMentionDetect.js');

describe('@AskAI autonomous mention dispatch', () => {
  let authorA;
  let commenterB;
  let testCommunity;
  let testPost;
  let tokenA;
  let tokenB;

  beforeAll(async () => {
    while (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    authorA = await User.create({
      username: 'askaiAuthor',
      email: 'askaiAuthor@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });

    commenterB = await User.create({
      username: 'askaiCommenter',
      email: 'askaiCommenter@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });

    testCommunity = await Community.create({
      name: 'AskAI Community',
      slug: 'askai-community',
      description: 'For @AskAI tests',
      createdBy: authorA._id,
      members: 1,
    });

    testPost = await Post.create({
      title: 'AskAI Test Post',
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
    await User.deleteMany({
      _id: { $in: [authorA?._id, commenterB?._id] },
    });

    await mongoose.connection.close();
    await redis.quit();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Notification.deleteMany({});
    await Post.updateOne({ _id: testPost?._id }, { $unset: { lastNeoReplyAt: '' } });
    jest.clearAllMocks();
    neoQueueAdd.mockResolvedValue({ id: 'mock-neo-job-uuid' });
    mockRedis.incr.mockResolvedValue(1);
  });

  async function createCommentAs(body, parentId = null) {
    return request(app)
      .post(`/api/posts/${testPost._id}/comments`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ body, parentId });
  }

  async function createCommentAsAuthorA(body, parentId = null) {
    return request(app)
      .post(`/api/posts/${testPost._id}/comments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ body, parentId });
  }

  describe('detectNeoMention', () => {
    it('matches a standalone @AskAI case-insensitively', () => {
      expect(detectNeoMention('What do you think, @AskAI?')).toBe(true);
      expect(detectNeoMention('help me out @askai')).toBe(true);
      expect(detectNeoMention('@ASKAi please')).toBe(true);
      expect(detectNeoMention(' @AskAI leading space')).toBe(true);
    });

    it('requires a whole word — not a substring of an email or username', () => {
      expect(detectNeoMention('emails@AskAIcorp.com')).toBe(false);
      expect(detectNeoMention('hi@AskAI')).toBe(false);
      expect(detectNeoMention('someone@AskAI.com')).toBe(false);
      expect(detectNeoMention('x@AskAIy')).toBe(false);
    });

    it('does not match plain "AskAI" without an @', () => {
      expect(detectNeoMention('AskAI is cool')).toBe(false);
      expect(detectNeoMention('My friend askai likes this')).toBe(false);
    });

    it('does not match other mentions', () => {
      expect(detectNeoMention('@someoneelse here')).toBe(false);
      expect(detectNeoMention('@AskAIfoo longusername')).toBe(false);
    });

    it('handles non-string input', () => {
      expect(detectNeoMention(undefined)).toBe(false);
      expect(detectNeoMention(null)).toBe(false);
    });
  });

  describe('stripNeoMention', () => {
    it('removes the trigger token and trims the question', () => {
      expect(stripNeoMention('@AskAI what do you think?')).toBe('what do you think?');
      expect(stripNeoMention('Summarize this, @AskAI')).toBe('Summarize this,');
      expect(stripNeoMention('no trigger here')).toBe('no trigger here');
    });
  });

  describe('comment creation with @AskAI', () => {
    it('creates the comment normally and enqueues a mention job', async () => {
      const res = await createCommentAs('Summarize this thread, @AskAI!');

      expect(res.status).toBe(201);
      expect(res.body.data.body).toBe('Summarize this thread, @AskAI!');
      expect(String(res.body.data.author._id)).toBe(String(commenterB._id));
      expect(res.body.meta).toEqual({});

      expect(neoQueueAdd).toHaveBeenCalledTimes(1);
      expect(neoQueueAdd).toHaveBeenCalledWith(
        'mention',
        expect.objectContaining({
          trigger: 'mention',
          triggerCommentId: String(res.body.data._id),
          postId: String(testPost._id),
          communityId: String(testCommunity._id),
          requestingUserId: String(commenterB._id),
          question: 'Summarize this thread,!',
        }),
        expect.objectContaining({ attempts: 3 })
      );
    });

    it('flags meta.rateLimited when the daily autonomous budget is spent', async () => {
      mockRedis.incr.mockResolvedValue(11);

      const res = await createCommentAs('please @AskAI help');
      expect(res.status).toBe(201);
      expect(res.body.meta.rateLimited).toBe(true);
      expect(neoQueueAdd).not.toHaveBeenCalled();
    });

    it('flags meta.neoCooldown and skips the job when Neo replied to this post recently', async () => {
      await Post.updateOne({ _id: testPost._id }, { lastNeoReplyAt: new Date() });

      const res = await createCommentAs('one more @AskAI please');
      expect(res.status).toBe(201);
      expect(res.body.meta.neoCooldown).toBe(true);
      expect(res.body.meta.rateLimited).toBeUndefined();
      expect(neoQueueAdd).not.toHaveBeenCalled();
    });

    it('does NOT create a user-mention notification for @AskAI', async () => {
      const res = await createCommentAs('hello @AskAI, any thoughts?');
      expect(res.status).toBe(201);

      const notifications = await Notification.find({ type: 'mention' });
      expect(notifications).toHaveLength(0);
    });

    it('still fires the job for @askai (lowercase)', async () => {
      const res = await createCommentAs('please @askai help');
      expect(res.status).toBe(201);
      expect(neoQueueAdd).toHaveBeenCalledTimes(1);
      expect(neoQueueAdd).toHaveBeenCalledWith(
        'mention',
        expect.objectContaining({
          trigger: 'mention',
          requestingUserId: String(commenterB._id),
          question: 'please help',
        }),
        expect.any(Object)
      );
    });
  });

  describe('comments without @AskAI', () => {
    it('does not enqueue a job', async () => {
      const res = await createCommentAs('just a normal comment');
      expect(res.status).toBe(201);
      expect(neoQueueAdd).not.toHaveBeenCalled();
    });
  });

  describe('existing @mention notifications still fire', () => {
    it('creates a mention notification for a real user', async () => {
      const res = await createCommentAs(`hello @${authorA.username}, great post!`);
      expect(res.status).toBe(201);

      const notifications = await Notification.find({
        user: authorA._id,
        type: 'mention',
      });

      expect(notifications).toHaveLength(1);
      expect(String(notifications[0].actor)).toBe(String(commenterB._id));
      expect(String(notifications[0].target)).toBe(String(res.body.data._id));
    });

    it('still fires a reply notification when replying with @AskAI in the body', async () => {
      const parentRes = await createCommentAsAuthorA('parent by author');
      const parentComment = parentRes.body.data;

      const replyRes = await createCommentAs('agree with parent, @AskAI', parentComment._id);
      expect(replyRes.status).toBe(201);

      const notifications = await Notification.find({
        user: authorA._id,
        type: 'reply',
      });

      expect(notifications).toHaveLength(1);
      expect(neoQueueAdd).toHaveBeenCalledTimes(1);
    });
  });
});
