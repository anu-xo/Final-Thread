import { jest } from '@jest/globals';

// ── Env ──────────────────────────────────────────────────────────────────────
// config/neoConfig.js reads these at import time — defaults are fine for the
// tests (24h window, 4200s TTL), but we pin them so .env can't shift behavior.
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.NEO_PULSE_WINDOW_HOURS = '24';
process.env.NEO_PULSE_CACHE_TTL_SECONDS = '4200';

// ── Mocks ────────────────────────────────────────────────────────────────────
// Pulse writes to Redis via config/redis.js — replace it with an in-memory store
// so we can assert on the exact key/value the cron writes (and that it wrote
// nothing on the floor-skips).
const redisStore = new Map();

const mockRedisClient = {
  on: jest.fn(),
  ping: jest.fn().mockResolvedValue('PONG'),
  quit: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(async (key) => redisStore.get(key) ?? null),
  set: jest.fn(async (...args) => {
    redisStore.set(args[0], args[1]);
    return 'OK';
  }),
};

jest.unstable_mockModule('../src/config/redis.js', () => ({
  redis: mockRedisClient,
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

// Capture the cron registration so we can assert the schedule expression
// (hourly, offset from staleNudgeCron's :00).
let pulseScheduleExpr = null;
let scheduledCallback = null;
jest.unstable_mockModule('node-cron', () => ({
  default: {
    schedule: jest.fn((expr, cb) => {
      pulseScheduleExpr = expr;
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
const { default: Post } = await import('../src/models/Post.js');
const { computeCommunityPulse, registerPulseCron } = await import(
  '../src/jobs/pulseCron.js'
);

describe('community pulse — trending topics (hourly cron)', () => {
  let owner;

  async function createCommunity(slug, overrides = {}) {
    return Community.create({
      name: `Community ${slug}`,
      slug,
      description: 'test community',
      createdBy: owner._id,
      members: 1,
      aiEnabled: true,
      ...overrides,
    });
  }

  async function createPost(community, title) {
    return Post.create({
      title,
      body: 'body',
      author: owner._id,
      community: community._id,
      score: 1,
    });
  }

  const pulseKey = (community) => `community:${community._id}:pulse`;

  beforeAll(() => {
    registerPulseCron();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Community.deleteMany({});
    await Post.deleteMany({});

    redisStore.clear();

    jest.clearAllMocks();

    owner = await User.create({
      username: 'pulse-owner',
      email: 'pulse-owner@test.com',
      passwordHash: 'dummy_hash',
      role: 'user',
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('caches a term shared by 2+ recent posts as trending', async () => {
    const community = await createCommunity('active');
    await createPost(community, 'MongoDB sharding patterns');
    await createPost(community, 'MongoDB indexing tips');
    await createPost(community, 'MongoDB aggregation pipelines');
    await createPost(community, 'React hooks guide');
    await createPost(community, 'Vite build speed tricks');

    const result = await computeCommunityPulse();

    expect(result).toEqual({ generated: 1 });
    const key = pulseKey(community);
    expect(redisStore.has(key)).toBe(true);

    const trending = JSON.parse(redisStore.get(key));
    const mongodb = trending.find((t) => t.term === 'mongodb');
    expect(mongodb).toBeDefined();
    expect(mongodb.count).toBe(3);

    // Singleton terms (react, vite, ...) fall below the 2-post floor.
    expect(trending.every((t) => t.term !== 'react')).toBe(true);
    expect(trending.every((t) => t.term !== 'vite')).toBe(true);
  });

  it('does not write a pulse for communities below the 3-post activity floor', async () => {
    const quiet = await createCommunity('quiet');
    await createPost(quiet, 'MongoDB sharding patterns');
    await createPost(quiet, 'MongoDB indexing tips');

    // Plenty of activity, but AI disabled — must also be skipped.
    const disabled = await createCommunity('disabled', { aiEnabled: false });
    await createPost(disabled, 'MongoDB sharding patterns');
    await createPost(disabled, 'MongoDB indexing tips');
    await createPost(disabled, 'MongoDB aggregation pipelines');

    await computeCommunityPulse();

    expect(redisStore.has(pulseKey(quiet))).toBe(false);
    expect(redisStore.has(pulseKey(disabled))).toBe(false);
  });

  it('excludes a term that appears in exactly one post', async () => {
    const community = await createCommunity('freq');
    await createPost(community, 'common topic alpha');
    await createPost(community, 'common topic beta');
    await createPost(community, 'common topic gamma');
    await createPost(community, 'oneoff idea');

    await computeCommunityPulse();

    const trending = JSON.parse(redisStore.get(pulseKey(community)));
    const terms = trending.map((t) => t.term);
    expect(terms).toContain('common');
    expect(terms).toContain('topic');
    expect(terms).not.toContain('oneoff');
  });

  it('never surfaces stopwords regardless of frequency', async () => {
    const community = await createCommunity('stopword');
    await createPost(community, 'the how why nudge');
    await createPost(community, 'the how why nudge');
    await createPost(community, 'the how why nudge');

    await computeCommunityPulse();

    const trending = JSON.parse(redisStore.get(pulseKey(community)));
    const terms = trending.map((t) => t.term);
    expect(terms).toContain('nudge');
    for (const stop of ['the', 'how', 'why']) {
      expect(terms).not.toContain(stop);
    }
  });

  it('registers the hourly schedule offset from staleNudgeCron', () => {
    expect(pulseScheduleExpr).toBe('15 * * * *');
    expect(scheduledCallback).toBeInstanceOf(Function);
  });
});
