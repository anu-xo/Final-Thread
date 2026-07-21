import { jest } from '@jest/globals';

const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'mock-job-uuid' }),
};

jest.unstable_mockModule('../jobs/embeddingQueue.js', () => ({
  getEmbeddingQueue: () => mockQueue,
}));

const mockRedis = {
  on: jest.fn().mockReturnThis(),
  ping: jest.fn().mockResolvedValue('PONG'),
  quit: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
};

jest.unstable_mockModule('ioredis', () => ({
  Redis: jest.fn(() => mockRedis),
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.NODE_ENV = 'test';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongoServer = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongoServer.getUri();
process.env.REDIS_URL = 'redis://localhost:6379';

const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { default: jwt } = await import('jsonwebtoken');
const { default: app } = await import('../app.js');
const { default: User } = await import('../models/User.js');
const { default: ActivityEvent } = await import('../models/ActivityEvent.js');

const FAKE_POST_ID = new mongoose.Types.ObjectId().toHexString();

describe('GET /api/admin/stats/versions', () => {
  let adminUser;
  let adminToken;

  beforeAll(async () => {
    while (mongoose.connection.readyState !== 1) {
      await new Promise((r) => setTimeout(r, 50));
    }

    adminUser = await User.create({
      username: 'version_admin',
      email: 'version_admin@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'admin',
    });

    adminToken = jwt.sign(
      { userId: adminUser._id, role: adminUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await User.deleteOne({ _id: adminUser._id });
    await ActivityEvent.deleteMany({});
    await mongoose.connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await ActivityEvent.deleteMany({});
    mockRedis.get.mockResolvedValue(null);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/admin/stats/versions');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const user = await User.create({
      username: 'regular_user',
      email: 'regular@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const res = await request(app)
      .get('/api/admin/stats/versions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    await User.deleteOne({ _id: user._id });
  });

  it('returns empty versions when no ActivityEvents exist', async () => {
    const res = await request(app)
      .get('/api/admin/stats/versions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.versions).toEqual([]);
    expect(res.body.data.totals).toEqual({ totalEvents: 0, uniqueUsers: 0 });
    expect(res.body.data.window).toHaveProperty('from');
    expect(res.body.data.window).toHaveProperty('to');
  });

  it('groups desktop users by version with distinct counts', async () => {
    const now = new Date();
    const userId1 = new mongoose.Types.ObjectId();
    const userId2 = new mongoose.Types.ObjectId();
    const userId3 = new mongoose.Types.ObjectId();

    await ActivityEvent.insertMany([
      { user: userId1, event: 'user.login', platform: 'desktop', appVersion: '1.2.0', createdAt: now },
      { user: userId1, event: 'post.created', platform: 'desktop', appVersion: '1.2.0', createdAt: now },
      { user: userId2, event: 'user.login', platform: 'desktop', appVersion: '1.2.0', createdAt: now },
      { user: userId3, event: 'user.login', platform: 'desktop', appVersion: '1.1.0', createdAt: now },
      { user: userId3, event: 'vote.cast', platform: 'desktop', appVersion: '1.1.0', createdAt: now },
      { user: userId3, event: 'ai.chat', platform: 'desktop', appVersion: '1.1.0', createdAt: now },
    ]);

    const res = await request(app)
      .get('/api/admin/stats/versions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    const { versions, totals } = res.body.data;
    expect(versions).toHaveLength(2);

    const v120 = versions.find((v) => v.version === '1.2.0');
    expect(v120.userCount).toBe(2);
    expect(v120.requestCount).toBe(3);

    const v110 = versions.find((v) => v.version === '1.1.0');
    expect(v110.userCount).toBe(1);
    expect(v110.requestCount).toBe(3);

    expect(totals.uniqueUsers).toBe(3);
    expect(totals.totalEvents).toBe(6);
  });

  it('excludes web platform events from aggregation', async () => {
    const now = new Date();

    await ActivityEvent.insertMany([
      { user: new mongoose.Types.ObjectId(), event: 'user.login', platform: 'web', appVersion: null, createdAt: now },
      { user: new mongoose.Types.ObjectId(), event: 'user.login', platform: 'web', appVersion: null, createdAt: now },
      { user: new mongoose.Types.ObjectId(), event: 'user.login', platform: 'desktop', appVersion: '1.2.0', createdAt: now },
    ]);

    const res = await request(app)
      .get('/api/admin/stats/versions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.versions).toHaveLength(1);
    expect(res.body.data.versions[0].version).toBe('1.2.0');
    expect(res.body.data.versions[0].requestCount).toBe(1);
    expect(res.body.data.totals.uniqueUsers).toBe(1);
  });

  it('excludes events older than 7 days', async () => {
    const now = new Date();
    const eightDaysAgo = new Date(now);
    eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);

    await ActivityEvent.insertMany([
      { user: new mongoose.Types.ObjectId(), event: 'user.login', platform: 'desktop', appVersion: '1.0.0', createdAt: eightDaysAgo },
      { user: new mongoose.Types.ObjectId(), event: 'user.login', platform: 'desktop', appVersion: '1.2.0', createdAt: now },
    ]);

    const res = await request(app)
      .get('/api/admin/stats/versions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.versions).toHaveLength(1);
    expect(res.body.data.versions[0].version).toBe('1.2.0');
  });

  it('versions are sorted descending', async () => {
    const now = new Date();

    await ActivityEvent.insertMany([
      { user: new mongoose.Types.ObjectId(), event: 'user.login', platform: 'desktop', appVersion: '1.0.0', createdAt: now },
      { user: new mongoose.Types.ObjectId(), event: 'user.login', platform: 'desktop', appVersion: '1.3.0', createdAt: now },
      { user: new mongoose.Types.ObjectId(), event: 'user.login', platform: 'desktop', appVersion: '1.1.0', createdAt: now },
    ]);

    const res = await request(app)
      .get('/api/admin/stats/versions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const versions = res.body.data.versions.map((v) => v.version);
    expect(versions).toEqual(['1.3.0', '1.1.0', '1.0.0']);
  });

  it('serves from Redis cache on second call', async () => {
    const now = new Date();
    await ActivityEvent.create({
      user: new mongoose.Types.ObjectId(),
      event: 'user.login',
      platform: 'desktop',
      appVersion: '1.2.0',
      createdAt: now,
    });

    const first = await request(app)
      .get('/api/admin/stats/versions')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(first.status).toBe(200);

    const second = await request(app)
      .get('/api/admin/stats/versions')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(second.status).toBe(200);
    expect(second.body.data.versions).toEqual(first.body.data.versions);
  });

  // ── Version gate cross-check ────────────────────────────────────────────

  it('version gate returns 426 for versions below minimum', async () => {
    const res = await request(app)
      .get(`/api/posts/${FAKE_POST_ID}`)
      .set('X-App-Platform', 'electron')
      .set('X-App-Version', '0.9.0');

    expect(res.status).toBe(426);
    expect(res.body.error.code).toBe('UPGRADE_REQUIRED');
    expect(res.body.meta.minimum).toBe('1.0.0');
  });

  it('version gate passes valid versions through (not 426)', async () => {
    const res = await request(app)
      .get(`/api/posts/${FAKE_POST_ID}`)
      .set('X-App-Platform', 'electron')
      .set('X-App-Version', '1.0.0');

    // Not 426 — the gate lets it through. 404/other codes are expected
    // since the post doesn't exist.
    expect(res.status).not.toBe(426);
  });

  it('does not create ActivityEvent for blocked requests (426)', async () => {
    const countBefore = await ActivityEvent.countDocuments();

    await request(app)
      .get(`/api/posts/${FAKE_POST_ID}`)
      .set('X-App-Platform', 'electron')
      .set('X-App-Version', '0.9.0');

    const countAfter = await ActivityEvent.countDocuments();
    expect(countAfter).toBe(countBefore);
  });
});
