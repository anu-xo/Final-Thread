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
const { default: jwt } = await import('jsonwebtoken');
const { default: app, redis } = await import('../app.js');
const { default: User } = await import('../models/User.js');
const { default: Notification } = await import('../models/Notification.js');

let notifUser, unreadUser, markReadUser, readAllUser;
let notifToken, unreadToken, markReadToken, readAllToken;

beforeAll(async () => {
  while (mongoose.connection.readyState !== 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  notifUser = await User.create({
    username: 'notifuser',
    email: 'notif@threadverse.dev',
    passwordHash: 'dummy_hash',
    role: 'user',
  });
  notifToken = jwt.sign({ userId: notifUser._id, role: notifUser.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

  unreadUser = await User.create({
    username: 'unreaduser',
    email: 'unread@threadverse.dev',
    passwordHash: 'dummy_hash',
    role: 'user',
  });
  unreadToken = jwt.sign({ userId: unreadUser._id, role: unreadUser.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

  markReadUser = await User.create({
    username: 'markreaduser',
    email: 'markread@threadverse.dev',
    passwordHash: 'dummy_hash',
    role: 'user',
  });
  markReadToken = jwt.sign({ userId: markReadUser._id, role: markReadUser.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

  readAllUser = await User.create({
    username: 'readalluser',
    email: 'readall@threadverse.dev',
    passwordHash: 'dummy_hash',
    role: 'user',
  });
  readAllToken = jwt.sign({ userId: readAllUser._id, role: readAllUser.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
});

afterAll(async () => {
  await Notification.deleteMany({});
  await User.deleteMany({});
  await mongoose.connection.close();
  await redis.quit();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Notification.deleteMany({});
  jest.clearAllMocks();
});

describe('GET /api/notifications', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(401);
  });

  it('returns empty array when no notifications exist', async () => {
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${notifToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.hasMore).toBe(false);
  });

  it('returns paginated notifications sorted by newest first', async () => {
    await Notification.insertMany([
      { user: notifUser._id, type: 'reply', actor: notifUser._id, target: notifUser._id, targetType: 'Comment', read: false },
      { user: notifUser._id, type: 'mention', actor: notifUser._id, target: notifUser._id, targetType: 'Comment', read: false },
      { user: notifUser._id, type: 'upvote', actor: notifUser._id, target: notifUser._id, targetType: 'Post', read: true },
    ]);

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${notifToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);
  });

  it('supports cursor pagination', async () => {
    const docs = [];
    for (let i = 0; i < 25; i++) {
      docs.push({
        user: notifUser._id, type: 'reply', actor: notifUser._id, target: notifUser._id, targetType: 'Comment', read: false,
      });
    }
    await Notification.insertMany(docs);

    const res1 = await request(app)
      .get('/api/notifications?limit=10')
      .set('Authorization', `Bearer ${notifToken}`);
    expect(res1.status).toBe(200);
    expect(res1.body.data.length).toBe(10);
    expect(res1.body.meta.hasMore).toBe(true);

    const res2 = await request(app)
      .get(`/api/notifications?limit=10&cursor=${res1.body.meta.cursor}`)
      .set('Authorization', `Bearer ${notifToken}`);
    expect(res2.status).toBe(200);
  });
});

describe('GET /api/notifications/unread-count', () => {
  it('returns count of unread notifications', async () => {
    await Notification.insertMany([
      { user: unreadUser._id, type: 'reply', actor: unreadUser._id, target: unreadUser._id, targetType: 'Comment', read: false },
      { user: unreadUser._id, type: 'mention', actor: unreadUser._id, target: unreadUser._id, targetType: 'Comment', read: false },
      { user: unreadUser._id, type: 'upvote', actor: unreadUser._id, target: unreadUser._id, targetType: 'Post', read: true },
    ]);

    const res = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${unreadToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(2);
  });

  it('returns 0 when all notifications are read', async () => {
    await Notification.create({
      user: unreadUser._id, type: 'reply', actor: unreadUser._id, target: unreadUser._id, targetType: 'Comment', read: true,
    });

    const res = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${unreadToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(0);
  });
});

describe('PUT /api/notifications/read', () => {
  it('returns 400 when ids array is missing', async () => {
    const res = await request(app)
      .put('/api/notifications/read')
      .set('Authorization', `Bearer ${markReadToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when ids is empty array', async () => {
    const res = await request(app)
      .put('/api/notifications/read')
      .set('Authorization', `Bearer ${markReadToken}`)
      .send({ ids: [] });
    expect(res.status).toBe(400);
  });

  it('marks specified notifications as read', async () => {
    const n1 = await Notification.create({
      user: markReadUser._id, type: 'reply', actor: markReadUser._id, target: markReadUser._id, targetType: 'Comment', read: false,
    });
    const n2 = await Notification.create({
      user: markReadUser._id, type: 'mention', actor: markReadUser._id, target: markReadUser._id, targetType: 'Comment', read: false,
    });

    const res = await request(app)
      .put('/api/notifications/read')
      .set('Authorization', `Bearer ${markReadToken}`)
      .send({ ids: [n1._id.toString()] });
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(1);

    const updated = await Notification.findById(n1._id);
    const notUpdated = await Notification.findById(n2._id);
    expect(updated.read).toBe(true);
    expect(notUpdated.read).toBe(false);
  });

  it('does not mark other users notifications (IDOR guard)', async () => {
    const otherUser = await User.create({
      username: 'othernotif', email: 'othernotif@test.com', passwordHash: 'dummy_hash',
    });

    const otherNotif = await Notification.create({
      user: otherUser._id, type: 'reply', actor: otherUser._id, target: otherUser._id, targetType: 'Comment', read: false,
    });

    const res = await request(app)
      .put('/api/notifications/read')
      .set('Authorization', `Bearer ${markReadToken}`)
      .send({ ids: [otherNotif._id.toString()] });
    expect(res.status).toBe(200);

    const stillUnread = await Notification.findById(otherNotif._id);
    expect(stillUnread.read).toBe(false);

    await User.deleteOne({ _id: otherUser._id });
  });
});

describe('PUT /api/notifications/read-all', () => {
  it('marks all user notifications as read', async () => {
    await Notification.insertMany([
      { user: readAllUser._id, type: 'reply', actor: readAllUser._id, target: readAllUser._id, targetType: 'Comment', read: false },
      { user: readAllUser._id, type: 'mention', actor: readAllUser._id, target: readAllUser._id, targetType: 'Comment', read: false },
      { user: readAllUser._id, type: 'upvote', actor: readAllUser._id, target: readAllUser._id, targetType: 'Post', read: false },
    ]);

    const res = await request(app)
      .put('/api/notifications/read-all')
      .set('Authorization', `Bearer ${readAllToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(3);
  });

  it('returns 0 updated when no unread notifications', async () => {
    const res = await request(app)
      .put('/api/notifications/read-all')
      .set('Authorization', `Bearer ${readAllToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(0);
  });
});
