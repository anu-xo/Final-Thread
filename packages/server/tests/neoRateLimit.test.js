import { jest } from '@jest/globals';

// ── Env ──────────────────────────────────────────────────────────────────────
process.env.NEO_ACTIVE_DAILY_LIMIT = '3';
process.env.NEO_STALE_POST_HOURS = '12';
process.env.NEO_STALE_MIN_COMMUNITY_MEMBERS = '5';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

// ── Shared in-memory Redis store ─────────────────────────────────────────────
// Drives both the unit tests (key isolation, TTL, reset) and the stale-nudge
// integration test (5 incr calls against one user key → 1,2,3,4,5).
const store = new Map();

const mockRedis = {
  incr: jest.fn(async (key) => {
    const next = (store.get(key) || 0) + 1;
    store.set(key, next);
    return next;
  }),
  expire: jest.fn(async (key, ttl) => {
    store.set(`ttl:${key}`, ttl);
    return 1;
  }),
};

const mockIo = {
  to: jest.fn().mockReturnValue({ emit: jest.fn() }),
};

jest.unstable_mockModule('../src/config/redis.js', () => ({
  redis: mockRedis,
}));

jest.unstable_mockModule('../src/jobs/embeddingQueue.js', () => ({
  getEmbeddingQueue: () => ({
    add: jest.fn().mockResolvedValue({ id: 'mock-embedding-job-uuid' }),
  }),
}));

jest.unstable_mockModule('../src/socket.js', () => ({
  getIO: () => mockIo,
  initIO: jest.fn(),
}));

const { checkActiveLayerRateLimit, isActiveLayerNudgeAllowed } = await import(
  '../src/utils/neoRateLimit.js'
);

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongoServer = await MongoMemoryServer.create();
const { default: mongoose } = await import('mongoose');
await mongoose.connect(mongoServer.getUri());

const { default: User } = await import('../src/models/User.js');
const { default: Community } = await import('../src/models/Community.js');
const { default: Post } = await import('../src/models/Post.js');
const { default: Notification } = await import('../src/models/Notification.js');
const { default: NeoLog } = await import('../src/models/NeoLog.js');
const { runStaleNudgeCheck } = await import('../src/jobs/staleNudgeCron.js');

const NEO_ACTIVE_DAILY_LIMIT = Number(process.env.NEO_ACTIVE_DAILY_LIMIT);

afterAll(async () => {
  await mongoose.connection.close();
  await mongoServer.stop();
});

describe('checkActiveLayerRateLimit — per-user daily cap', () => {
  const userId = '507f1f77bcf86cd799439011';
  const today = new Date().toISOString().slice(0, 10);
  const expectedKey = `neo:active:${userId}:${today}`;

  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();
  });

  it('allows the first 3 calls of the day and blocks the 4th for the same user', async () => {
    await expect(checkActiveLayerRateLimit(userId)).resolves.toBe(true);
    await expect(checkActiveLayerRateLimit(userId)).resolves.toBe(true);
    await expect(checkActiveLayerRateLimit(userId)).resolves.toBe(true);
    await expect(checkActiveLayerRateLimit(userId)).resolves.toBe(false);
  });

  it('increments the 4th call even though it returns false (count stays accurate)', async () => {
    for (let i = 0; i < 4; i++) {
      await checkActiveLayerRateLimit(userId);
    }
    expect(store.get(expectedKey)).toBe(4);
  });

  it('keeps counters independent for different users on the same day', async () => {
    const userA = 'user-a-111111';
    const userB = 'user-b-222222';

    for (let i = 0; i < NEO_ACTIVE_DAILY_LIMIT; i++) {
      await expect(checkActiveLayerRateLimit(userA)).resolves.toBe(true);
      await expect(checkActiveLayerRateLimit(userB)).resolves.toBe(true);
    }
    await expect(checkActiveLayerRateLimit(userA)).resolves.toBe(false);
    await expect(checkActiveLayerRateLimit(userB)).resolves.toBe(false);

    expect(mockRedis.incr).toHaveBeenCalledWith(`neo:active:${userA}:${today}`);
    expect(mockRedis.incr).toHaveBeenCalledWith(`neo:active:${userB}:${today}`);
  });

  it('sets a 24h TTL on the first hit of the day and not on later hits', async () => {
    await checkActiveLayerRateLimit(userId);
    await checkActiveLayerRateLimit(userId);
    expect(mockRedis.expire).toHaveBeenCalledTimes(1);
    expect(mockRedis.expire).toHaveBeenCalledWith(expectedKey, 24 * 60 * 60);
  });

  it('starts a fresh counter once the 24h key expires', async () => {
    await checkActiveLayerRateLimit(userId); // day 1 → allowed
    expect(mockRedis.expire).toHaveBeenCalledWith(expectedKey, 24 * 60 * 60);

    store.delete(expectedKey); // Redis drops the key after the TTL

    await expect(checkActiveLayerRateLimit(userId)).resolves.toBe(true); // day 2 → allowed again
    expect(mockRedis.expire).toHaveBeenCalledTimes(2);
    expect(mockRedis.expire).toHaveBeenLastCalledWith(expectedKey, 24 * 60 * 60);
  });
});

describe('isActiveLayerNudgeAllowed — opt-out gate', () => {
  let author;

  beforeAll(async () => {
    author = await User.create({
      username: 'nudge-gate-author',
      email: 'nudge-gate@test.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });
  });

  beforeEach(async () => {
    store.clear();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await User.deleteMany({});
  });

  it('allows when the user has not opted out and is under the cap', async () => {
    await expect(isActiveLayerNudgeAllowed(author._id)).resolves.toBe(true);
  });

  it('blocks when the user set neoActiveNudges to false', async () => {
    await User.findByIdAndUpdate(author._id, {
      $set: { 'notifPrefs.neoActiveNudges': false },
    });
    await expect(isActiveLayerNudgeAllowed(author._id)).resolves.toBe(false);
    expect(mockRedis.incr).not.toHaveBeenCalled(); // pref short-circuits before the cap
  });

  it('treats an unset neoActiveNudges as opted-in (legacy prefs not silently opted out)', async () => {
    await User.findByIdAndUpdate(author._id, {
      $set: { notifPrefs: { digest: true, replies: true, mentions: true } },
    });
    await expect(isActiveLayerNudgeAllowed(author._id)).resolves.toBe(true);
  });
});

describe('staleNudgeCron — per-user cap across many posts', () => {
  let author;
  let community;

  function hoursAgo(hours) {
    return new Date(Date.now() - hours * 60 * 60 * 1000);
  }

  beforeAll(async () => {
    author = await User.create({
      username: 'stale-limited-author',
      email: 'stale-limited@test.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });
    community = await Community.create({
      name: 'stale-limited-community',
      slug: 'stale-limited',
      description: 'rate-limit cron test',
      createdBy: author._id,
      members: 10,
      aiEnabled: true,
    });
  });

  afterAll(async () => {
    await Notification.deleteMany({});
    await NeoLog.deleteMany({});
    await Post.deleteMany({});
    await Community.deleteMany({});
    await User.deleteMany({});
  });

  beforeEach(async () => {
    store.clear();
    jest.clearAllMocks();
    await Notification.deleteMany({});
    await NeoLog.deleteMany({});
    await Post.deleteMany({});
  });

  it('creates exactly 3 notifications for 5 stale posts by the same author (limit=3)', async () => {
    for (let i = 0; i < 5; i++) {
      await Post.create({
        title: `Stale limited post ${i}`,
        author: author._id,
        community: community._id,
        commentCount: 0,
        createdAt: hoursAgo(13),
      });
    }

    const result = await runStaleNudgeCheck();

    expect(result.checked).toBe(5); // all 5 were candidates
    expect(await Notification.countDocuments({ type: 'stale_post_nudge' })).toBe(3);
    expect(await NeoLog.countDocuments({ triggerType: 'active_stale' })).toBe(3);
  });
});
