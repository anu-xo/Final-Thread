import { jest } from '@jest/globals';

// ── Shared mocks ─────────────────────────────────────────────────────────────
// The neo-autonomous queue is mocked so the comment route can enqueue without
// Redis/Bull; the embedding queue is mocked because every comment save fires its
// hook; Redis is mocked for the daily-limit bookkeeping; socket + aiService are
// mocked so the worker never touches Gemini or real sockets.
const neoQueueAdd = jest.fn().mockResolvedValue({ id: 'mock-neo-job-uuid' });

const mockEmbeddingQueue = {
  add: jest.fn().mockResolvedValue({ id: 'mock-embedding-job-uuid' }),
};

let capturedProcessor = null;
const queueEventHandlers = {};

const mockNeoQueue = {
  add: neoQueueAdd,
  process: jest.fn((name, fn) => { capturedProcessor = fn; }),
  on: jest.fn((event, handler) => { queueEventHandlers[event] = handler; }),
};

const mockRedis = {
  on: jest.fn().mockReturnThis(),
  ping: jest.fn().mockResolvedValue('PONG'),
  quit: jest.fn().mockResolvedValue(undefined),
  incr: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
};

const mockEmit = jest.fn();
const mockIoTo = jest.fn().mockReturnValue({ emit: mockEmit });
const mockIo = { to: mockIoTo };

const mockEmbedQuery = jest.fn();
const mockRetrieveContext = jest.fn();
const mockBuildPromptWithinBudget = jest.fn();
const mockBuildSystemPrompt = jest.fn();
const mockGenerateNonStreamingResponse = jest.fn();

jest.unstable_mockModule('ioredis', () => ({
  Redis: jest.fn(() => mockRedis),
}));

jest.unstable_mockModule('../src/jobs/embeddingQueue.js', () => ({
  getEmbeddingQueue: () => mockEmbeddingQueue,
}));

jest.unstable_mockModule('../src/jobs/neoAutonomousQueue.js', () => ({
  getNeoAutonomousQueue: () => mockNeoQueue,
}));

jest.unstable_mockModule('../src/socket.js', () => ({
  getIO: () => mockIo,
  initIO: jest.fn(),
}));

jest.unstable_mockModule('../src/services/aiService.js', () => ({
  embedQuery: mockEmbedQuery,
  retrieveContext: mockRetrieveContext,
  buildPromptWithinBudget: mockBuildPromptWithinBudget,
  buildSystemPrompt: mockBuildSystemPrompt,
  generateNonStreamingResponse: mockGenerateNonStreamingResponse,
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongoServer = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongoServer.getUri();
process.env.REDIS_URL = 'redis://localhost:6379';

const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { default: jwt } = await import('jsonwebtoken');
const { default: app, redis } = await import('../src/app.js');
const { default: User } = await import('../src/models/User.js');
const { default: Community } = await import('../src/models/Community.js');
const { default: Post } = await import('../src/models/Post.js');
const { default: Comment } = await import('../src/models/Comment.js');
const { default: Notification } = await import('../src/models/Notification.js');
const { default: NeoLog } = await import('../src/models/NeoLog.js');
const { detectNeoMention } = await import('../src/utils/neoMentionDetect.js');
const { processNeoMentionJob } = await import('../src/jobs/neoAutonomousWorker.js');

describe('@AskAI autonomous mention — dispatch + worker', () => {
  let authorA;
  let commenterB;
  let neoUser;
  let testCommunity;
  let testPost;
  let tokenA;
  let tokenB;

  beforeAll(async () => {
    while (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    authorA = await User.create({
      username: 'neoMentionAuthor',
      email: 'neoMentionAuthor@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });

    commenterB = await User.create({
      username: 'neoMentionCommenter',
      email: 'neoMentionCommenter@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });

    neoUser = await User.create({
      username: 'neo-ai',
      email: 'neo@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });

    testCommunity = await Community.create({
      name: 'Neo Mention Community',
      slug: 'neo-mention-community',
      description: 'For autonomous mention tests',
      createdBy: authorA._id,
      members: 1,
    });

    testPost = await Post.create({
      title: 'Neo Mention Test Post',
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

  function makeJobData(trigger, question = 'what do you think?') {
    return {
      triggerCommentId: String(trigger._id),
      postId: String(testPost._id),
      communityId: String(testCommunity._id),
      requestingUserId: '507f1f77bcf86cd799439022',
      question,
    };
  }

  afterAll(async () => {
    await NeoLog.deleteMany({});
    await Notification.deleteMany({});
    await Comment.deleteMany({ post: testPost?._id });
    await Post.deleteOne({ _id: testPost?._id });
    await Community.deleteOne({ _id: testCommunity?._id });
    await User.deleteMany({
      _id: { $in: [authorA?._id, commenterB?._id, neoUser?._id] },
    });

    await mongoose.connection.close();
    await redis.quit();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Notification.deleteMany({});
    await NeoLog.deleteMany({});
    await Post.updateOne({ _id: testPost?._id }, { $unset: { lastNeoReplyAt: '' } });
    jest.clearAllMocks();
    neoQueueAdd.mockResolvedValue({ id: 'mock-neo-job-uuid' });
    mockRedis.incr.mockResolvedValue(1);
    mockEmbedQuery.mockResolvedValue(new Array(768).fill(0.1));
    mockRetrieveContext.mockResolvedValue([{ text: 'chunk one', postId: String(testPost?._id) }]);
    mockBuildPromptWithinBudget.mockResolvedValue({ prompt: 'assembled prompt', tokenCount: 42, historyUsed: [] });
    mockBuildSystemPrompt.mockReturnValue('system prompt');
    mockGenerateNonStreamingResponse.mockResolvedValue('Neo reply text');
  });

  async function createCommentAs(body, parentId = null) {
    return request(app)
      .post(`/api/posts/${testPost._id}/comments`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ body, parentId });
  }

  describe('mention dispatch (route)', () => {
    it('enqueues a mention job when a comment asks @AskAI, stripping the trigger from the question', async () => {
      const res = await createCommentAs("@AskAI what's the consensus here?");

      expect(res.status).toBe(201);
      expect(neoQueueAdd).toHaveBeenCalledTimes(1);
      expect(neoQueueAdd).toHaveBeenCalledWith(
        'mention',
        expect.objectContaining({
          trigger: 'mention',
          triggerCommentId: String(res.body.data._id),
          postId: String(testPost._id),
          communityId: String(testCommunity._id),
          requestingUserId: String(commenterB._id),
          question: "what's the consensus here?",
        }),
        expect.objectContaining({ attempts: 3 })
      );
    });

    it('does not trigger for an email containing @AskAI (word-boundary regex)', async () => {
      expect(detectNeoMention('email@AskAIcorp.com')).toBe(false);

      const res = await createCommentAs('email@AskAIcorp.com');

      expect(res.status).toBe(201);
      expect(neoQueueAdd).not.toHaveBeenCalled();
    });

    it('does not enqueue a job when the user is at their daily autonomous limit', async () => {
      mockRedis.incr.mockResolvedValue(11);

      const res = await createCommentAs('one more @AskAI please');

      expect(res.status).toBe(201);
      expect(res.body.meta.rateLimited).toBe(true);
      expect(neoQueueAdd).not.toHaveBeenCalled();
    });
  });

  describe('worker with mocked Gemini', () => {
    let triggerComment;
    let parentAtDepth4;
    let triggerAtDepth5;

    beforeAll(async () => {
      triggerComment = await Comment.create({
        body: '@AskAI what do you think?',
        author: authorA._id,
        post: testPost._id,
        parent: null,
        depth: 0,
      });

      parentAtDepth4 = await Comment.create({
        body: 'depth 4 parent',
        author: authorA._id,
        post: testPost._id,
        parent: null,
        depth: 4,
      });

      triggerAtDepth5 = await Comment.create({
        body: 'deep @AskAI check',
        author: authorA._id,
        post: testPost._id,
        parent: parentAtDepth4._id,
        depth: 5,
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('posts a Neo reply authored by neo-ai as a child of the trigger comment', async () => {
      const commentCreateSpy = jest.spyOn(Comment, 'create');
      const result = await processNeoMentionJob({
        data: makeJobData(triggerComment),
        id: 'job-1',
      });

      expect(commentCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Neo reply text',
          author: expect.any(mongoose.Types.ObjectId),
          post: String(testPost._id),
          parent: String(triggerComment._id),
          depth: 1,
          isNeo: true,
          neoTrigger: 'mention',
        })
      );
      expect(mockGenerateNonStreamingResponse).toHaveBeenCalledTimes(1);

      const created = await Comment.findById(result.commentId);
      expect(created.isNeo).toBe(true);
      expect(String(created.author)).toBe(String(neoUser._id));
      expect(String(created.parent)).toBe(String(triggerComment._id));

      expect(mockIoTo).toHaveBeenCalledWith(`post:${String(testPost._id)}`);
      expect(mockEmit).toHaveBeenCalledWith(
        'comment:ai_posted',
        expect.objectContaining({
          postId: String(testPost._id),
          comment: expect.objectContaining({
            isNeo: true,
            author: expect.objectContaining({ username: 'neo-ai' }),
          }),
        })
      );
    });

    it('attaches the reply as a sibling at depth 5 (not 6) when the trigger comment is at depth 5', async () => {
      const commentCreateSpy = jest.spyOn(Comment, 'create');
      const result = await processNeoMentionJob({
        data: makeJobData(triggerAtDepth5),
        id: 'job-depth',
      });

      expect(commentCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          depth: 5,
          isNeo: true,
        })
      );
      const createArgs = commentCreateSpy.mock.calls[0][0];
      expect(String(createArgs.parent)).toBe(String(triggerAtDepth5.parent));
      expect(String(createArgs.parent)).not.toBe(String(triggerAtDepth5._id));
      expect(commentCreateSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ depth: 6 })
      );

      const created = await Comment.findById(result.commentId);
      expect(created.depth).toBe(5);
      expect(String(created.parent)).toBe(String(triggerAtDepth5.parent));
    });

    it('still nests normally (depth 5 child) when the trigger comment is at depth 4', async () => {
      const result = await processNeoMentionJob({
        data: makeJobData(parentAtDepth4, 'at the cap edge'),
        id: 'job-depth-4',
      });

      const created = await Comment.findById(result.commentId);
      expect(created.depth).toBe(5);
      expect(String(created.parent)).toBe(String(parentAtDepth4._id));
    });

    it('registers the "mention" processor', () => {
      expect(capturedProcessor).toBeInstanceOf(Function);
      expect(queueEventHandlers.failed).toBeInstanceOf(Function);
      expect(queueEventHandlers.stalled).toBeInstanceOf(Function);
    });
  });
});
