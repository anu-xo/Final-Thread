import { jest } from '@jest/globals';

const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'mock-job-uuid' }),
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
  getEmbeddingQueue: () => mockQueue,
}));

jest.unstable_mockModule('ioredis', () => ({
  Redis: jest.fn(() => mockRedis),
}));

jest.unstable_mockModule('../socket.js', () => ({
  getIO: () => mockIo,
  initIO: jest.fn(),
}));

process.env.NEO_STALE_POST_HOURS = '12';
process.env.NEO_STALE_MIN_COMMUNITY_MEMBERS = '5';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongoServer = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongoServer.getUri();
process.env.REDIS_URL = 'redis://localhost:6379';

const { default: mongoose } = await import('mongoose');
const { default: User } = await import('../models/User.js');
const { default: Community } = await import('../models/Community.js');
const { default: Post } = await import('../models/Post.js');
const { default: Notification } = await import('../models/Notification.js');
const { default: NeoLog } = await import('../models/NeoLog.js');
const { runStaleNudgeCheck } = await import('../jobs/staleNudgeCron.js');

describe('staleNudgeCron runStaleNudgeCheck', () => {
  let author;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI);

    author = await User.create({
      username: 'staleAuthor',
      email: 'stale@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });
  });

  afterAll(async () => {
    await Notification.deleteMany({});
    await NeoLog.deleteMany({});
    await Post.deleteMany({});
    await Community.deleteMany({});
    await User.deleteMany({});
    await mongoose.connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Notification.deleteMany({});
    await NeoLog.deleteMany({});
    await Post.deleteMany({});
    await Community.deleteMany({});
    jest.clearAllMocks();
  });

  function hoursAgo(hours) {
    return new Date(Date.now() - hours * 60 * 60 * 1000);
  }

  async function seedCommunity({ slug, members = 10, aiEnabled = true }) {
    return Community.create({
      name: slug,
      slug,
      description: 'stale nudge test community',
      createdBy: author._id,
      members,
      aiEnabled,
    });
  }

  async function seedPost(community, { hours = 13, commentCount = 0 } = {}) {
    return Post.create({
      title: 'Stale test post',
      author: author._id,
      community: community._id,
      commentCount,
      createdAt: hoursAgo(hours),
    });
  }

  it('nudges a post with 0 comments older than the threshold in an eligible community', async () => {
    const community = await seedCommunity({ slug: 'stale-eligible' });
    const post = await seedPost(community, { hours: 13 });

    const result = await runStaleNudgeCheck();

    expect(result.checked).toBe(1);
    const notif = await Notification.findOne({ user: author._id, type: 'stale_post_nudge' });
    expect(notif).toBeTruthy();
    expect(String(notif.target)).toBe(String(post._id));
    expect(notif.targetType).toBe('Post');
    expect(notif.actor).toBeNull();

    const log = await NeoLog.findOne({ triggerType: 'active_stale', sourcePostIds: post._id });
    expect(log).toBeTruthy();
    expect(String(log.communityId)).toBe(String(community._id));
    expect(String(log.targetUserId)).toBe(String(author._id));
    expect(log.metadata.hoursSincePosted).toBe(12);

    expect(mockIo.to).toHaveBeenCalledWith(`user:${author._id}`);
    expect(mockIo.to().emit).toHaveBeenCalledWith('notification:new', expect.objectContaining({ type: 'stale_post_nudge' }));
  });

  it('does NOT nudge a post newer than the threshold', async () => {
    const community = await seedCommunity({ slug: 'stale-fresh' });
    await seedPost(community, { hours: 6 });

    const result = await runStaleNudgeCheck();

    expect(result.checked).toBe(0);
    expect(await Notification.findOne({ type: 'stale_post_nudge' })).toBeNull();
    expect(await NeoLog.findOne({ triggerType: 'active_stale' })).toBeNull();
  });

  it('does NOT send a duplicate nudge when the post was already nudged', async () => {
    const community = await seedCommunity({ slug: 'stale-already' });
    const post = await seedPost(community, { hours: 13 });

    await NeoLog.create({
      triggerType: 'active_stale',
      layerUsed: 'aggregation',
      sourcePostIds: [post._id],
      communityId: community._id,
      targetUserId: author._id,
      metadata: { hoursSincePosted: 12 },
    });

    const result = await runStaleNudgeCheck();

    expect(result.checked).toBe(1); // still a candidate, but skipped
    expect(await Notification.findOne({ type: 'stale_post_nudge' })).toBeNull();
    expect(await NeoLog.countDocuments({ triggerType: 'active_stale' })).toBe(1);
  });

  it('does NOT nudge posts in communities below MIN_MEMBERS', async () => {
    const community = await seedCommunity({ slug: 'stale-tiny', members: 4 });
    await seedPost(community, { hours: 13 });

    const result = await runStaleNudgeCheck();

    expect(result.checked).toBe(0);
    expect(await Notification.findOne({ type: 'stale_post_nudge' })).toBeNull();
  });

  it('does NOT nudge posts in communities with aiEnabled: false', async () => {
    const community = await seedCommunity({ slug: 'stale-no-ai', aiEnabled: false });
    await seedPost(community, { hours: 13 });

    const result = await runStaleNudgeCheck();

    expect(result.checked).toBe(0);
    expect(await Notification.findOne({ type: 'stale_post_nudge' })).toBeNull();
  });

  it('skips the nudge when the user has hit the daily active-layer limit', async () => {
    const community = await seedCommunity({ slug: 'stale-limited' });
    await seedPost(community, { hours: 13 });

    mockRedis.incr.mockResolvedValueOnce(4); // 4th hit of the day → blocked

    const result = await runStaleNudgeCheck();

    expect(result.checked).toBe(1); // still a candidate, but suppressed by the cap
    expect(await Notification.findOne({ type: 'stale_post_nudge' })).toBeNull();
    expect(await NeoLog.findOne({ triggerType: 'active_stale' })).toBeNull();
  });
});
