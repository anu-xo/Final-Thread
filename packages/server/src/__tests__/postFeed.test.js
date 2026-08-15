import { jest } from '@jest/globals';

const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'mock-job-uuid' }),
};

const mockRedis = {
  on: jest.fn().mockReturnThis(),
  ping: jest.fn().mockResolvedValue('PONG'),
  quit: jest.fn().mockResolvedValue(undefined),
};

jest.unstable_mockModule('../jobs/embeddingQueue.js', () => ({
  getEmbeddingQueue: () => mockQueue,
}));

jest.unstable_mockModule('ioredis', () => ({
  Redis: jest.fn(() => mockRedis),
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongoServer = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongoServer.getUri();
process.env.REDIS_URL = 'redis://localhost:6379';

const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { default: app, redis } = await import('../app.js');
const { default: User } = await import('../models/User.js');
const { default: Community } = await import('../models/Community.js');
const { default: Post } = await import('../models/Post.js');

describe('GET /api/posts — global (all-communities) feed', () => {
  let testUser;
  let communityA;
  let communityB;
  let removedPost;

  beforeAll(async () => {
    while (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    testUser = await User.create({
      username: 'global-feed-user',
      email: 'global-feed@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });

    communityA = await Community.create({
      name: 'Global Feed A',
      slug: 'global-feed-a',
      description: 'First community',
      createdBy: testUser._id,
      members: 1,
    });

    communityB = await Community.create({
      name: 'Global Feed B',
      slug: 'global-feed-b',
      description: 'Second community',
      createdBy: testUser._id,
      members: 1,
    });

    removedPost = await Post.create({
      title: 'Removed Post',
      body: 'Should never appear',
      author: testUser._id,
      community: communityA._id,
      isRemoved: true,
    });
  });

  afterAll(async () => {
    await Post.deleteMany({ author: testUser?._id });
    await Community.deleteMany({ _id: { $in: [communityA?._id, communityB?._id] } });
    await User.deleteOne({ _id: testUser?._id });

    await mongoose.connection.close();
    await redis.quit();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Post.deleteMany({
      author: testUser._id,
      _id: { $ne: removedPost._id },
    });
    jest.clearAllMocks();
  });

  it('works without a community filter and returns posts across all communities', async () => {
    await Post.create({
      title: 'From A',
      body: 'Body',
      author: testUser._id,
      community: communityA._id,
    });
    await Post.create({
      title: 'From B',
      body: 'Body',
      author: testUser._id,
      community: communityB._id,
    });

    const res = await request(app).get('/api/posts');

    expect(res.status).toBe(200);
    const titles = res.body.data.posts.map((post) => post.title);
    expect(titles).toContain('From A');
    expect(titles).toContain('From B');
  });

  it('excludes removed posts from the global feed', async () => {
    const res = await request(app).get('/api/posts');

    expect(res.status).toBe(200);
    const titles = res.body.data.posts.map((post) => post.title);
    expect(titles).not.toContain('Removed Post');
  });

  it('populates community so cards can render r/name and links', async () => {
    await Post.create({
      title: 'Community Populated',
      body: 'Body',
      author: testUser._id,
      community: communityB._id,
    });

    const res = await request(app).get('/api/posts');

    expect(res.status).toBe(200);
    const post = res.body.data.posts.find((p) => p.title === 'Community Populated');
    expect(post.community).toBeDefined();
    expect(post.community.slug).toBe('global-feed-b');
    expect(post.community.name).toBe('Global Feed B');
  });

  it('filters to a single community when the community param is provided', async () => {
    await Post.create({
      title: 'Only A',
      body: 'Body',
      author: testUser._id,
      community: communityA._id,
    });
    await Post.create({
      title: 'Only B',
      body: 'Body',
      author: testUser._id,
      community: communityB._id,
    });

    const res = await request(app).get('/api/posts?community=global-feed-a');

    expect(res.status).toBe(200);
    const titles = res.body.data.posts.map((post) => post.title);
    expect(titles).toContain('Only A');
    expect(titles).not.toContain('Only B');
  });

  it('sorts by hotScore when sort=hot and by createdAt when sort=new', async () => {
    await Post.create({
      title: 'Hot Leader',
      body: 'Body',
      author: testUser._id,
      community: communityA._id,
      hotScore: 0.95,
      createdAt: new Date(Date.now() - 60_000),
    });
    await Post.create({
      title: 'Hot Follower',
      body: 'Body',
      author: testUser._id,
      community: communityB._id,
      hotScore: 0.4,
      createdAt: new Date(Date.now() - 30_000),
    });

    const hotRes = await request(app).get('/api/posts?sort=hot');
    expect(hotRes.status).toBe(200);
    const hotTitles = hotRes.body.data.posts.map((post) => post.title);
    expect(hotTitles[0]).toBe('Hot Leader');

    const newRes = await request(app).get('/api/posts?sort=new');
    expect(newRes.status).toBe(200);
    const newTitles = newRes.body.data.posts.map((post) => post.title);
    expect(newTitles[0]).toBe('Hot Follower');
  });

  it('cursor-paginates across all communities without overlap', async () => {
    const total = 25;
    for (let i = 0; i < total; i += 1) {
      await Post.create({
        title: `Page Post ${i}`,
        body: 'Body',
        author: testUser._id,
        community: i % 2 === 0 ? communityA._id : communityB._id,
        createdAt: new Date(Date.now() - i * 60_000),
      });
    }

    const first = await request(app).get('/api/posts?sort=new&limit=10');
    expect(first.status).toBe(200);
    expect(first.body.data.posts).toHaveLength(10);
    expect(first.body.data.hasMore).toBe(true);
    expect(first.body.data.nextCursor).toBeTruthy();

    const second = await request(app).get(
      `/api/posts?sort=new&limit=10&cursor=${encodeURIComponent(first.body.data.nextCursor)}`
    );
    expect(second.status).toBe(200);
    expect(second.body.data.posts).toHaveLength(10);

    const firstIds = new Set(first.body.data.posts.map((post) => post._id));
    const overlap = second.body.data.posts.filter((post) => firstIds.has(post._id));
    expect(overlap).toHaveLength(0);

    const third = await request(app).get(
      `/api/posts?sort=new&limit=10&cursor=${encodeURIComponent(second.body.data.nextCursor)}`
    );
    expect(third.status).toBe(200);
    expect(third.body.data.posts).toHaveLength(5);
    expect(third.body.data.hasMore).toBe(false);
  });
});
