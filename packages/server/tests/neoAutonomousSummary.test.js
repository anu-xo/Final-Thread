import { jest } from '@jest/globals';

// ── Shared mocks ─────────────────────────────────────────────────────────────
// The neo-autonomous queue is mocked so the summarize route can enqueue without
// Redis/Bull; the embedding queue is mocked because every comment save fires its
// hook; Redis is mocked for app bootstrapping; socket + aiService are mocked so
// the worker never touches Gemini or real sockets.
const neoQueueAdd = jest.fn().mockResolvedValue({ id: 'mock-summary-job-uuid' });

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
const mockBuildThreadSummaryPrompt = jest.fn();
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
  buildThreadSummaryPrompt: mockBuildThreadSummaryPrompt,
  generateNonStreamingResponse: mockGenerateNonStreamingResponse,
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongoServer = await MongoMemoryServer.create({
  instance: { launchTimeout: 120000 },
});
process.env.MONGODB_URI = mongoServer.getUri();
process.env.REDIS_URL = 'redis://localhost:6379';

const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { default: jwt } = await import('jsonwebtoken');
const { default: app, redis } = await import('../src/app.js');
const { default: User } = await import('../src/models/User.js');
const { default: Community } = await import('../src/models/Community.js');
const { default: CommunityMember } = await import('../src/models/CommunityMember.js');
const { default: Post } = await import('../src/models/Post.js');
const { default: Comment } = await import('../src/models/Comment.js');
const { default: Notification } = await import('../src/models/Notification.js');
const { default: NeoLog } = await import('../src/models/NeoLog.js');
const { processNeoSummaryJob } = await import('../src/jobs/neoAutonomousWorker.js');

describe('Neo thread summary — dispatch (route) + worker', () => {
  let author;
  let mod;
  let member;
  let neoUser;
  let testCommunity;
  let testPost;
  let modToken;
  let memberToken;

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

    neoUser = await User.create({
      username: 'neo-ai',
      email: 'neo@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });

    testCommunity = await Community.create({
      name: 'Summary Community',
      slug: 'summary-community',
      description: 'For autonomous summary tests',
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
  });

  afterAll(async () => {
    await Notification.deleteMany({});
    await NeoLog.deleteMany({});
    await CommunityMember.deleteMany({ community: testCommunity?._id });
    await Comment.deleteMany({ post: testPost?._id });
    await Post.deleteOne({ _id: testPost?._id });
    await Community.deleteOne({ _id: testCommunity?._id });
    await User.deleteMany({
      _id: { $in: [author?._id, mod?._id, member?._id, neoUser?._id] },
    });

    await mongoose.connection.close();
    await redis.quit();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Notification.deleteMany({});
    await NeoLog.deleteMany({});
    await Comment.deleteMany({ post: testPost?._id });
    jest.clearAllMocks();
    neoQueueAdd.mockResolvedValue({ id: 'mock-summary-job-uuid' });
    mockRedis.incr.mockResolvedValue(1);
    mockGenerateNonStreamingResponse.mockResolvedValue('Summary text');
    mockBuildThreadSummaryPrompt.mockReturnValue('assembled summary prompt');
  });

  async function summarizeAs(token, postId = testPost?._id) {
    return request(app)
      .post(`/api/posts/${postId}/summarize`)
      .set('Authorization', `Bearer ${token}`);
  }

  describe('POST /posts/:id/summarize — dispatch (route)', () => {
    it('rejects a plain community member with 403 and never enqueues', async () => {
      const res = await summarizeAs(memberToken);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('mod');
      expect(neoQueueAdd).not.toHaveBeenCalled();
    });

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

    it('returns 409 and does not enqueue a duplicate when a summary comment already exists', async () => {
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
  });

  describe('processNeoSummaryJob — worker with mocked Gemini', () => {
    function makeJobData() {
      return {
        postId: String(testPost._id),
        communityId: String(testCommunity._id),
        requestingUserId: String(mod._id),
      };
    }

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('pins a top-level Neo summary comment: isPinned, depth 0, parent null', async () => {
      const commentCreateSpy = jest.spyOn(Comment, 'create');
      const result = await processNeoSummaryJob({ data: makeJobData(), id: 'job-1' });

      expect(commentCreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Summary text',
          author: expect.any(mongoose.Types.ObjectId),
          post: String(testPost._id),
          parent: null,
          depth: 0,
          isNeo: true,
          neoTrigger: 'summary',
          isPinned: true,
        })
      );
      expect(mockGenerateNonStreamingResponse).toHaveBeenCalledTimes(1);

      const created = await Comment.findById(result.commentId);
      expect(created).not.toBeNull();
      expect(created.isPinned).toBe(true);
      expect(created.depth).toBe(0);
      expect(created.parent).toBeNull();
      expect(created.isNeo).toBe(true);
      expect(created.neoTrigger).toBe('summary');
      expect(String(created.author)).toBe(String(neoUser._id));

      expect(mockIoTo).toHaveBeenCalledWith(`post:${String(testPost._id)}`);
      expect(mockEmit).toHaveBeenCalledWith(
        'comment:ai_posted',
        expect.objectContaining({
          postId: String(testPost._id),
          comment: expect.objectContaining({
            isNeo: true,
            neoTrigger: 'summary',
            isPinned: true,
            author: expect.objectContaining({ username: 'neo-ai' }),
          }),
        })
      );
    });

    it('caps the top-comments fetch at 30, sorted by score descending', async () => {
      const comments = [];
      for (let i = 1; i <= 40; i += 1) {
        comments.push({
          body: `comment ${i}`,
          author: author._id,
          post: testPost._id,
          parent: null,
          depth: 0,
          score: i,
        });
      }
      await Comment.create(comments);

      const result = await processNeoSummaryJob({ data: makeJobData(), id: 'job-cap' });

      expect(mockBuildThreadSummaryPrompt).toHaveBeenCalledTimes(1);
      const { topComments } = mockBuildThreadSummaryPrompt.mock.calls[0][0];

      expect(topComments).toHaveLength(30);
      expect(topComments[0].score).toBe(40);
      expect(topComments[29].score).toBe(11);

      const scores = topComments.map((c) => c.score);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));

      expect(result.commentId).toBeDefined();
    });

    it('registers the "summary" processor and its event handlers', () => {
      expect(capturedProcessor).toBeInstanceOf(Function);
      expect(queueEventHandlers.failed).toBeInstanceOf(Function);
      expect(queueEventHandlers.stalled).toBeInstanceOf(Function);
    });
  });
});
