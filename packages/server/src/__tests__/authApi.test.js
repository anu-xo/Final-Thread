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
};

jest.unstable_mockModule('../jobs/embeddingQueue.js', () => ({
  getEmbeddingQueue: () => mockQueue,
}));

jest.unstable_mockModule('ioredis', () => ({
  Redis: jest.fn(() => mockRedis),
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongoServer = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongoServer.getUri();
process.env.REDIS_URL = 'redis://localhost:6379';

const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { default: jwt } = await import('jsonwebtoken');
const { default: app, redis } = await import('../app.js');
const { default: User } = await import('../models/User.js');
const bcrypt = await import('bcrypt');

let sharedUser;
let sharedAuthToken;
let sharedRefreshToken;

beforeAll(async () => {
  while (mongoose.connection.readyState !== 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  sharedUser = await User.create({
    username: 'authtest',
    email: 'authtest@threadverse.dev',
    passwordHash: await bcrypt.hash('password123', 12),
    role: 'user',
  });

  sharedAuthToken = jwt.sign(
    { userId: sharedUser._id, role: sharedUser.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  sharedRefreshToken = jwt.sign(
    { userId: sharedUser._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  await User.findByIdAndUpdate(sharedUser._id, {
    $push: { refreshTokens: sharedRefreshToken },
  });
});

afterAll(async () => {
  await User.deleteMany({});
  await mongoose.connection.close();
  await redis.quit();
  await mongoServer.stop();
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/auth/register', () => {
  it('returns 400 when fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'test' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when password is too short', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser', email: 'test@test.com', password: '1234567' });
    expect(res.status).toBe(400);
  });

  it('returns 409 when email is already taken', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'other', email: sharedUser.email, password: 'password123' });
    expect(res.status).toBe(409);
  });

  it('returns 409 when username is already taken', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: sharedUser.username, email: 'new@test.com', password: 'password123' });
    expect(res.status).toBe(409);
  });

  it('returns 201 with accessToken and user on success', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'newuser2', email: 'new2@test.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.username).toBe('newuser2');
  });
});

describe('POST /api/auth/login', () => {
  it('returns 401 for non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nope@test.com', password: 'password123' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: sharedUser.email, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for banned user', async () => {
    await User.findByIdAndUpdate(sharedUser._id, { isBanned: true });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: sharedUser.email, password: 'password123' });
    expect(res.status).toBe(403);
    await User.findByIdAndUpdate(sharedUser._id, { isBanned: false });
  });

  it('returns 403 for a system account', async () => {
    const sysUser = await User.create({
      username: 'neo-test',
      email: 'neo@threadverse.internal',
      passwordHash: null,
      role: 'user',
      isSystemAccount: true,
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: sysUser.email, password: 'does-not-matter' });
    expect(res.status).toBe(403);
    await User.findByIdAndDelete(sysUser._id);
  });

  it('returns 200 with accessToken on success', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: sharedUser.email, password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 200 with user profile', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${sharedAuthToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.username).toBe('authtest');
  });
});

describe('POST /api/auth/refresh', () => {
  it('returns 401 when no refresh token cookie', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('returns 200 with new accessToken on valid refresh', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${sharedRefreshToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });

  it('returns 401 for blacklisted refresh token', async () => {
    mockRedis.get.mockResolvedValueOnce('1');
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${sharedRefreshToken}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 for expired refresh token', async () => {
    const expiredToken = jwt.sign(
      { userId: sharedUser._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '0s' }
    );
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${expiredToken}`);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });

  it('returns 200 and clears cookie on success', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${sharedAuthToken}`);
    expect(res.status).toBe(200);
  });

  it('blacklists refresh token when provided', async () => {
    const refreshTkn = jwt.sign(
      { userId: sharedUser._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${sharedAuthToken}`)
      .set('Cookie', `refreshToken=${refreshTkn}`);
    expect(res.status).toBe(200);
    expect(mockRedis.set).toHaveBeenCalled();
  });
});

describe('GET /api/auth/desktop/version', () => {
  it('returns version info', async () => {
    const res = await request(app).get('/api/auth/desktop/version');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });
});
