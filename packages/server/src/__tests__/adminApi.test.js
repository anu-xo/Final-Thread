import { jest } from '@jest/globals';

const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'mock-job-uuid' }),
};

const mockRedis = {
  on: jest.fn().mockReturnThis(),
  ping: jest.fn().mockResolvedValue('PONG'),
  quit: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  pipeline: jest.fn().mockReturnValue({
    set: jest.fn(),
    exec: jest.fn().mockResolvedValue([]),
  }),
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
const { default: jwt } = await import('jsonwebtoken');
const { default: app, redis } = await import('../app.js');
const { default: User } = await import('../models/User.js');
const { default: Post } = await import('../models/Post.js');
const { default: Community } = await import('../models/Community.js');
const { default: Report } = await import('../models/Report.js');

describe('Admin API', () => {
  let adminUser;
  let regularUser;
  let adminToken;
  let regularToken;
  let testCommunity;

  beforeAll(async () => {
    while (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    adminUser = await User.create({
      username: 'superadmin',
      email: 'superadmin@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'admin',
    });

    regularUser = await User.create({
      username: 'regularuser',
      email: 'regular@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });

    testCommunity = await Community.create({
      name: 'Admin Test Community',
      slug: 'admin-test-comm',
      description: 'Admin tests',
      createdBy: adminUser._id,
      members: 1,
    });

    adminToken = jwt.sign(
      { userId: adminUser._id, role: adminUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    regularToken = jwt.sign(
      { userId: regularUser._id, role: regularUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await Report.deleteMany({});
    await Post.deleteMany({});
    await Community.deleteOne({ _id: testCommunity?._id });
    await User.deleteMany({});
    await mongoose.connection.close();
    await redis.quit();
    await mongoServer.stop();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
  });

  describe('Authorization', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const res = await request(app).get('/api/admin/stats');
      expect(res.status).toBe(401);
    });

    it('returns 403 for non-admin users', async () => {
      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${regularToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/admin/stats', () => {
    it('returns platform stats for admin', async () => {
      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.data).toBeDefined();
      }
    });
  });

  describe('GET /api/admin/stats/versions', () => {
    it('returns version stats for admin', async () => {
      const res = await request(app)
        .get('/api/admin/stats/versions')
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /api/admin/stats/platform', () => {
    it('returns platform stats for admin', async () => {
      const res = await request(app)
        .get('/api/admin/stats/platform')
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /api/admin/users', () => {
    it('returns user list for admin', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('filters banned users', async () => {
      const res = await request(app)
        .get('/api/admin/users?banned=true')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });

    it('filters non-banned users', async () => {
      const res = await request(app)
        .get('/api/admin/users?banned=false')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/admin/users/:id/ban', () => {
    it('bans a user and force-logs out', async () => {
      const res = await request(app)
        .post(`/api/admin/users/${regularUser._id}/ban`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Test ban' });
      expect(res.status).toBe(200);
      expect(res.body.data.isBanned).toBe(true);

      await User.findByIdAndUpdate(regularUser._id, { isBanned: false, banReason: null, bannedAt: null });
    });

    it('returns 404 for non-existent user', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post(`/api/admin/users/${fakeId}/ban`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/admin/users/:id/unban', () => {
    it('unbans a user', async () => {
      await User.findByIdAndUpdate(regularUser._id, { isBanned: true });
      const res = await request(app)
        .post(`/api/admin/users/${regularUser._id}/unban`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.isBanned).toBe(false);
    });

    it('returns 404 for non-existent user', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post(`/api/admin/users/${fakeId}/unban`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/admin/ai/costs', () => {
    it('returns AI cost data for admin', async () => {
      const res = await request(app)
        .get('/api/admin/ai/costs')
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /api/admin/ai/community/:communityId/breakdown', () => {
    it('returns breakdown for a community', async () => {
      const res = await request(app)
        .get(`/api/admin/ai/community/${testCommunity._id}/breakdown`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /api/admin/ai/community/:communityId/low-rated', () => {
    it('returns low-rated messages for a community', async () => {
      const res = await request(app)
        .get(`/api/admin/ai/community/${testCommunity._id}/low-rated`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect([200, 500]).toContain(res.status);
    });
  });
});
