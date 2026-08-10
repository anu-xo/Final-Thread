import { jest } from '@jest/globals';

// ── Env ──────────────────────────────────────────────────────────────────────
// config/redis.js only builds a client when REDIS_URL is truthy — set it so the
// mocked ioredis supplies the in-memory store (a real value also stops dotenv
// from overriding it with the production Upstash URL in .env).
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.APP_URL = 'https://threadverse.test';
process.env.JWT_UNSUB_SECRET = process.env.JWT_UNSUB_SECRET || 'test-unsub-secret';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

// ── Shared mocks ─────────────────────────────────────────────────────────────
// In-memory Redis that also records the operation order, so we can prove phase 1
// (set) completes before phase 2 reads any cache key (mget) — the "ordering, not
// just presence" assertion.
const redisStore = new Map();
const redisOps = [];

const mockRedisClient = {
  on: jest.fn(),
  ping: jest.fn().mockResolvedValue('PONG'),
  quit: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(async (key) => {
    redisOps.push(['get', key]);
    return redisStore.get(key) ?? null;
  }),
  set: jest.fn(async (key, value) => {
    redisOps.push(['set', key]);
    redisStore.set(key, value);
    return 'OK';
  }),
  mget: jest.fn(async (...keys) => {
    const flat = keys.flat();
    redisOps.push(['mget', flat]);
    return flat.map((k) => redisStore.get(k) ?? null);
  }),
};

const mockGenerateNonStreamingResponse = jest.fn();
const mockBuildDigestHighlightPrompt = jest.fn();
const mockSendMail = jest.fn();
let scheduledCallback = null;

jest.unstable_mockModule('ioredis', () => ({
  Redis: jest.fn(() => mockRedisClient),
}));

jest.unstable_mockModule('nodemailer', () => ({
  default: { createTransport: jest.fn(() => ({ sendMail: mockSendMail })) },
}));

jest.unstable_mockModule('../src/services/aiService.js', () => ({
  generateNonStreamingResponse: mockGenerateNonStreamingResponse,
  buildDigestHighlightPrompt: mockBuildDigestHighlightPrompt,
}));

// Every post save fires its embedding hook — keep it off Bull.
jest.unstable_mockModule('../src/jobs/embeddingQueue.js', () => ({
  getEmbeddingQueue: () => ({
    add: jest.fn().mockResolvedValue({ id: 'mock-embedding-job-uuid' }),
  }),
}));

jest.unstable_mockModule('../src/socket.js', () => ({
  getIO: () => ({ to: jest.fn().mockReturnValue({ emit: jest.fn() }) }),
  initIO: jest.fn(),
}));

// Capture the cron callback so the ordering test can drive the real handler
// (real generateCommunityHighlights + sendWeeklyDigest, both awaited in order).
jest.unstable_mockModule('node-cron', () => ({
  default: {
    schedule: jest.fn((_expr, cb) => {
      scheduledCallback = cb;
    }),
  },
}));

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongoServer = await MongoMemoryServer.create({
  instance: { launchTimeout: 120000 },
});
const { default: mongoose } = await import('mongoose');
await mongoose.connect(mongoServer.getUri());

const { default: User } = await import('../src/models/User.js');
const { default: Community } = await import('../src/models/Community.js');
const { default: CommunityMember } = await import('../src/models/CommunityMember.js');
const { default: Post } = await import('../src/models/Post.js');
const { default: NeoLog } = await import('../src/models/NeoLog.js');
const { generateCommunityHighlights, currentIsoWeekKey } = await import(
  '../src/jobs/digestHighlights.js'
);
const { sendWeeklyDigest } = await import('../src/services/emailService.js');
const { registerDigestCron } = await import('../src/jobs/digestCron.js');

describe('weekly digest — highlights (phase 1) + unanswered questions (phase 2)', () => {
  let owner;
  let subscriberA;
  let subscriberB;

  async function createUser(username, email) {
    return User.create({
      username,
      email,
      passwordHash: 'dummy_hash',
      role: 'user',
      notifPrefs: { digest: true },
    });
  }

  async function createCommunity(slug) {
    return Community.create({
      name: `Community ${slug}`,
      slug,
      description: 'test community',
      createdBy: owner._id,
      members: 1,
    });
  }

  beforeAll(() => {
    registerDigestCron();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Community.deleteMany({});
    await CommunityMember.deleteMany({});
    await Post.deleteMany({});
    await NeoLog.deleteMany({});

    redisStore.clear();
    redisOps.length = 0;

    jest.clearAllMocks();
    mockGenerateNonStreamingResponse.mockResolvedValue('Weekly highlight text');
    mockBuildDigestHighlightPrompt.mockReturnValue('assembled digest prompt');
    mockSendMail.mockResolvedValue({ messageId: 'mock-message-id' });

    owner = await createUser('owner', 'owner@test.com');
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  describe('generateCommunityHighlights (phase 1)', () => {
    it('calls Gemini once for a community with activity, caches the result, and logs NeoLog', async () => {
      const community = await createCommunity('active');
      await Post.create([
        { title: 'Top post', body: 'body', author: owner._id, community: community._id, score: 10 },
        { title: 'Second post', body: 'body', author: owner._id, community: community._id, score: 5 },
      ]);

      const result = await generateCommunityHighlights();

      expect(result).toEqual({ generated: 1, skipped: 0 });
      expect(mockGenerateNonStreamingResponse).toHaveBeenCalledTimes(1);
      expect(mockGenerateNonStreamingResponse).toHaveBeenCalledWith('assembled digest prompt');

      const key = `neo:digest:community:${community._id}:${currentIsoWeekKey()}`;
      expect(redisStore.get(key)).toBe('Weekly highlight text');

      const logs = await NeoLog.find({ triggerType: 'digest', communityId: community._id });
      expect(logs).toHaveLength(1);
      expect(logs[0].layerUsed).toBe('aggregation');
      expect(logs[0].sourcePostIds).toHaveLength(2);
      expect(logs[0].latencyMs).toEqual(expect.any(Number));
    });

    it('does not call Gemini again on a same-week re-run (cache hit)', async () => {
      const community = await createCommunity('rerun');
      await Post.create([
        { title: 'Top post', body: 'body', author: owner._id, community: community._id, score: 10 },
      ]);

      const first = await generateCommunityHighlights();
      const second = await generateCommunityHighlights();

      expect(first.generated).toBe(1);
      expect(second.generated).toBe(0);
      expect(second.skipped).toBe(1);
      expect(mockGenerateNonStreamingResponse).toHaveBeenCalledTimes(1);

      const logs = await NeoLog.find({ triggerType: 'digest', communityId: community._id });
      expect(logs).toHaveLength(1);
    });

    it('does not call Gemini at all for a community with zero weekly activity', async () => {
      await createCommunity('empty');

      const result = await generateCommunityHighlights();

      expect(result).toEqual({ generated: 0, skipped: 1 });
      expect(mockGenerateNonStreamingResponse).not.toHaveBeenCalled();
      expect(await NeoLog.countDocuments({ triggerType: 'digest' })).toBe(0);
    });
  });

  describe('sendWeeklyDigest (phase 2)', () => {
    it('renders the unanswered-questions section only when qualifying posts exist', async () => {
      subscriberA = await createUser('digest-a-user', 'digest-a@test.com');
      subscriberB = await createUser('digest-b-user', 'digest-b@test.com');

      const communityA = await createCommunity('digest-a');
      await CommunityMember.create({ user: subscriberA._id, community: communityA._id, role: 'member' });
      const qualifying = await Post.create({
        title: 'Help with mongoose schemas',
        body: 'body',
        author: owner._id,
        community: communityA._id,
        score: 8,
        commentCount: 0,
      });
      await Post.create({
        title: 'Already discussed post',
        body: 'body',
        author: owner._id,
        community: communityA._id,
        score: 20,
        commentCount: 5,
      });

      const communityB = await createCommunity('digest-b');
      await CommunityMember.create({ user: subscriberB._id, community: communityB._id, role: 'member' });
      await Post.create({
        title: 'Covered post',
        body: 'body',
        author: owner._id,
        community: communityB._id,
        score: 12,
        commentCount: 3,
      });

      const result = await sendWeeklyDigest();

      expect(result.sent).toBe(2);

      const emails = mockSendMail.mock.calls.map((c) => c[0]);
      const mailA = emails.find((e) => e.to === subscriberA.email);
      const mailB = emails.find((e) => e.to === subscriberB.email);

      expect(mailA).toBeDefined();
      expect(mailA.html).toContain('Still looking for answers');
      expect(mailA.html).toContain(qualifying.title);

      expect(mailB).toBeDefined();
      expect(mailB.html).not.toContain('Still looking for answers');
    });
  });

  describe('digest cron ordering', () => {
    it('completes phase 1 before phase 2 reads any cache key (not just presence)', async () => {
      const community = await createCommunity('ordered');
      subscriberA = await createUser('ordered-subscriber', 'ordered-subscriber@test.com');
      await CommunityMember.create({ user: subscriberA._id, community: community._id, role: 'member' });
      await Post.create({
        title: 'Ordered post',
        body: 'body',
        author: owner._id,
        community: community._id,
        score: 15,
      });

      expect(scheduledCallback).toBeInstanceOf(Function);
      await scheduledCallback();

      const key = `neo:digest:community:${community._id}:${currentIsoWeekKey()}`;
      const setIdx = redisOps.findIndex(([op, k]) => op === 'set' && k === key);
      const mgetIdx = redisOps.findIndex(([op, keys]) => op === 'mget' && keys.includes(key));

      expect(setIdx).toBeGreaterThanOrEqual(0);
      expect(mgetIdx).toBeGreaterThan(setIdx);

      // Both phases actually ran through the real cron handler.
      expect(mockGenerateNonStreamingResponse).toHaveBeenCalledTimes(1);
      expect(mockSendMail).toHaveBeenCalledTimes(1);
    });
  });
});
