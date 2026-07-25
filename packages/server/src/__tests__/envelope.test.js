import request from 'supertest';
import mongoose from 'mongoose';
import app, { redis } from '../app.js';

// Routes that return JSON and should have {data, error, meta} envelope.
// We skip: /api/health (monitoring), /api/debug/* (dev helpers), /sitemap.xml (XML),
// /api/email/* (plain text), /api/docs* (swagger), and SSE endpoints (no JSON body).
const GENERIC_ROUTES = [
  { method: 'get',  path: '/api/desktop/version' },
  { method: 'get',  path: '/api/communities' },
  { method: 'get',  path: '/api/feed' },
  { method: 'get',  path: '/api/posts' },
  { method: 'get',  path: '/api/search?q=test' },
  { method: 'get',  path: '/api/notifications', auth: true },
  { method: 'get',  path: '/api/notifications/unread-count', auth: true },
  { method: 'get',  path: '/api/ai/health' },
];

// Routes that require auth — expect 401 with envelope when no token is sent.
const AUTH_REQUIRED_ROUTES = [
  { method: 'get',  path: '/api/users/me' },
  { method: 'put',  path: '/api/users/me', body: {} },
  { method: 'get',  path: '/api/communities/me' },
  { method: 'get',  path: '/api/mod/queue' },
  { method: 'post', path: '/api/mod/action', body: {} },
  { method: 'post', path: '/api/upload/sign' },
  { method: 'put',  path: '/api/notifications/read', body: { ids: [] } },
  { method: 'put',  path: '/api/notifications/read-all' },
  { method: 'get',  path: '/api/ai/conversations/000000000000000000000000/messages' },
  { method: 'post', path: '/api/ai/messages/000000000000000000000000/feedback', body: {} },
  // Admin routes — 401 without token
  { method: 'get',  path: '/api/admin/stats' },
  { method: 'get',  path: '/api/admin/stats/versions' },
  { method: 'get',  path: '/api/admin/stats/platform' },
  { method: 'get',  path: '/api/admin/users' },
  { method: 'post', path: '/api/admin/users/000000000000000000000000/ban', body: {} },
  { method: 'post', path: '/api/admin/users/000000000000000000000000/unban' },
  { method: 'get',  path: '/api/admin/ai/costs' },
  { method: 'get',  path: '/api/admin/ai/community/000000000000000000000000/breakdown' },
  { method: 'get',  path: '/api/admin/ai/community/000000000000000000000000/low-rated' },
];

function assertEnvelope(body) {
  const keys = Object.keys(body).sort();
  expect(keys).toEqual(['data', 'error', 'meta']);
}

function assertEnvelopeError(body) {
  assertEnvelope(body);
  expect(body.data).toBeNull();
  expect(typeof body.error).toBe('string');
  expect(body.error.length).toBeGreaterThan(0);
}

describe('Response envelope contract', () => {
  beforeAll(async () => {
    while (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
    await redis.quit();
  });

  // ── Every JSON route returns {data, error, meta} ─────────────────────────
  describe('Every JSON route returns {data, error, meta}', () => {
    for (const { method, path, auth } of GENERIC_ROUTES) {
      it(`${method.toUpperCase()} ${path} — envelope keys present`, async () => {
        const req = request(app)[method](path);
        const res = await req;
        assertEnvelope(res.body);
      });
    }
  });

  // ── x-request-id on every response ───────────────────────────────────────
  describe('x-request-id header', () => {
    for (const { method, path } of [
      { method: 'get', path: '/api/posts' },
      { method: 'get', path: '/api/nonexistent-route-xyz' },
      { method: 'post', path: '/api/auth/register' },
    ]) {
      it(`${method.toUpperCase()} ${path} — returns x-request-id header`, async () => {
        const res = await request(app)[method](path);
        const id = res.headers['x-request-id'];
        expect(id).toBeDefined();
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
      });
    }

    it('passes through client-provided x-request-id', async () => {
      const res = await request(app)
        .get('/api/posts')
        .set('x-request-id', 'my-custom-trace-id');
      expect(res.headers['x-request-id']).toBe('my-custom-trace-id');
    });
  });

  // ── Auth routes return {data, error, meta} ───────────────────────────────
  describe('Auth routes return {data, error, meta}', () => {
    it('POST /api/auth/register — 400 has envelope keys', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({});
      assertEnvelopeError(res.body);
    });

    it('POST /api/auth/login — 401 has envelope keys', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@test.com', password: 'wrong' });
      assertEnvelopeError(res.body);
    });

    it('POST /api/auth/refresh — 401 has envelope keys', async () => {
      const res = await request(app)
        .post('/api/auth/refresh');
      assertEnvelopeError(res.body);
    });

    it('POST /api/auth/logout — envelope keys', async () => {
      const res = await request(app)
        .post('/api/auth/logout');
      assertEnvelope(res.body);
    });
  });

  // ── Post routes return {data, error, meta} ───────────────────────────────
  describe('Post routes return {data, error, meta}', () => {
    it('GET /api/posts — success has envelope keys', async () => {
      const res = await request(app).get('/api/posts');
      assertEnvelope(res.body);
      expect(res.body.error).toBeNull();
      expect(res.body.data).toHaveProperty('posts');
      expect(res.body.data).toHaveProperty('nextCursor');
      expect(res.body.data).toHaveProperty('hasMore');
    });

    it('POST /api/posts — 401 (no auth) has envelope keys', async () => {
      const res = await request(app)
        .post('/api/posts')
        .send({});
      assertEnvelopeError(res.body);
    });

    it('GET /api/posts/:id — invalid id has envelope keys', async () => {
      const res = await request(app).get('/api/posts/not-a-valid-id');
      assertEnvelope(res.body);
    });

    it('GET /api/posts/:id/comments — envelope keys', async () => {
      const res = await request(app).get('/api/posts/000000000000000000000000/comments');
      assertEnvelope(res.body);
    });

    it('POST /api/posts/:id/comments — 401 (no auth) has envelope keys', async () => {
      const res = await request(app)
        .post('/api/posts/000000000000000000000000/comments')
        .send({ content: 'test' });
      assertEnvelopeError(res.body);
    });

    it('POST /api/posts/:id/vote — 401 (no auth) has envelope keys', async () => {
      const res = await request(app)
        .post('/api/posts/000000000000000000000000/vote')
        .send({ value: 1 });
      assertEnvelopeError(res.body);
    });
  });

  // ── Community routes return {data, error, meta} ──────────────────────────
  describe('Community routes return {data, error, meta}', () => {
    it('GET /api/communities — success has envelope keys', async () => {
      const res = await request(app).get('/api/communities');
      assertEnvelope(res.body);
      expect(res.body.error).toBeNull();
    });

    it('GET /api/communities/nonexistent-slug — 404 has envelope keys', async () => {
      const res = await request(app).get('/api/communities/this-community-definitely-does-not-exist-12345');
      assertEnvelopeError(res.body);
    });

    it('POST /api/communities — 401 (no auth) has envelope keys', async () => {
      const res = await request(app)
        .post('/api/communities')
        .send({ name: 'test' });
      assertEnvelopeError(res.body);
    });

    it('GET /api/communities/me — 401 (no auth) has envelope keys', async () => {
      const res = await request(app).get('/api/communities/me');
      assertEnvelopeError(res.body);
    });

    it('POST /api/communities/x/join — 401 (no auth) has envelope keys', async () => {
      const res = await request(app)
        .post('/api/communities/x/join');
      assertEnvelopeError(res.body);
    });

    it('POST /api/communities/x/leave — 401 (no auth) has envelope keys', async () => {
      const res = await request(app)
        .post('/api/communities/x/leave');
      assertEnvelopeError(res.body);
    });

    it('PUT /api/communities/x/rules — 401 (no auth) has envelope keys', async () => {
      const res = await request(app)
        .put('/api/communities/x/rules')
        .send({ rules: [] });
      assertEnvelopeError(res.body);
    });

    it('PUT /api/communities/x — 401 (no auth) has envelope keys', async () => {
      const res = await request(app)
        .put('/api/communities/x')
        .send({ aiEnabled: true });
      assertEnvelopeError(res.body);
    });

    it('POST /api/communities/x/flairs — 401 (no auth) has envelope keys', async () => {
      const res = await request(app)
        .post('/api/communities/x/flairs')
        .send({ name: 'test' });
      assertEnvelopeError(res.body);
    });
  });

  // ── User routes return {data, error, meta} ───────────────────────────────
  describe('User routes return {data, error, meta}', () => {
    it('GET /api/users/:username — 404 has envelope keys', async () => {
      const res = await request(app).get('/api/users/this-user-does-not-exist-xyz');
      assertEnvelopeError(res.body);
    });

    it('GET /api/users/:username/posts — 404 has envelope keys', async () => {
      const res = await request(app).get('/api/users/this-user-does-not-exist-xyz/posts');
      assertEnvelopeError(res.body);
    });

    it('GET /api/users/:username/comments — 404 has envelope keys', async () => {
      const res = await request(app).get('/api/users/this-user-does-not-exist-xyz/comments');
      assertEnvelopeError(res.body);
    });

    it('GET /api/users/me — 401 (no auth) has envelope keys', async () => {
      const res = await request(app).get('/api/users/me');
      assertEnvelopeError(res.body);
    });

    it('PUT /api/users/me — 401 (no auth) has envelope keys', async () => {
      const res = await request(app)
        .put('/api/users/me')
        .send({ bio: 'test' });
      assertEnvelopeError(res.body);
    });
  });

  // ── Vote routes return {data, error, meta} ───────────────────────────────
  describe('Vote routes return {data, error, meta}', () => {
    it('POST /api/votes — 401 (no auth) has envelope keys', async () => {
      const res = await request(app)
        .post('/api/votes')
        .send({});
      assertEnvelopeError(res.body);
    });
  });

  // ── Upload routes return {data, error, meta} ─────────────────────────────
  describe('Upload routes return {data, error, meta}', () => {
    it('POST /api/upload/sign — 401 (no auth) has envelope keys', async () => {
      const res = await request(app).post('/api/upload/sign');
      assertEnvelopeError(res.body);
    });
  });

  // ── Notification routes return {data, error, meta} ───────────────────────
  describe('Notification routes return {data, error, meta}', () => {
    it('GET /api/notifications — 401 (no auth) has envelope keys', async () => {
      const res = await request(app).get('/api/notifications');
      assertEnvelopeError(res.body);
    });

    it('GET /api/notifications/unread-count — 401 (no auth) has envelope keys', async () => {
      const res = await request(app).get('/api/notifications/unread-count');
      assertEnvelopeError(res.body);
    });

    it('PUT /api/notifications/read — 401 (no auth) has envelope keys', async () => {
      const res = await request(app)
        .put('/api/notifications/read')
        .send({ ids: [] });
      assertEnvelopeError(res.body);
    });

    it('PUT /api/notifications/read-all — 401 (no auth) has envelope keys', async () => {
      const res = await request(app).put('/api/notifications/read-all');
      assertEnvelopeError(res.body);
    });
  });

  // ── Report routes return {data, error, meta} ─────────────────────────────
  describe('Report routes return {data, error, meta}', () => {
    it('POST /api/reports — 401 (no auth) has envelope keys', async () => {
      const res = await request(app)
        .post('/api/reports')
        .send({ targetType: 'post', targetId: '000000000000000000000000', reason: 'spam' });
      assertEnvelopeError(res.body);
    });
  });

  // ── Moderation routes return {data, error, meta} ─────────────────────────
  describe('Moderation routes return {data, error, meta}', () => {
    it('GET /api/mod/queue — 401 (no auth) has envelope keys', async () => {
      const res = await request(app).get('/api/mod/queue');
      assertEnvelopeError(res.body);
    });

    it('POST /api/mod/action — 401 (no auth) has envelope keys', async () => {
      const res = await request(app)
        .post('/api/mod/action')
        .send({ type: 'approve' });
      assertEnvelopeError(res.body);
    });
  });

  // ── AI routes return {data, error, meta} ─────────────────────────────────
  describe('AI routes return {data, error, meta}', () => {
    it('GET /api/ai/health — success has envelope keys', async () => {
      const res = await request(app).get('/api/ai/health');
      assertEnvelope(res.body);
    });

    it('POST /api/ai/chat — 401 (no auth) has envelope keys with string error', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .send({});
      assertEnvelopeError(res.body);
    });

    it('GET /api/ai/conversations/:id/messages — 401 (no auth) has envelope keys', async () => {
      const res = await request(app).get('/api/ai/conversations/000000000000000000000000/messages');
      assertEnvelopeError(res.body);
    });

    it('POST /api/ai/messages/:id/feedback — 401 (no auth) has envelope keys', async () => {
      const res = await request(app)
        .post('/api/ai/messages/000000000000000000000000/feedback')
        .send({});
      assertEnvelopeError(res.body);
    });
  });

  // ── Admin routes return {data, error, meta} ──────────────────────────────
  describe('Admin routes return {data, error, meta}', () => {
    it('GET /api/admin/stats — 401 (no auth) has envelope keys', async () => {
      const res = await request(app).get('/api/admin/stats');
      assertEnvelopeError(res.body);
    });

    it('GET /api/admin/stats/versions — 401 (no auth) has envelope keys', async () => {
      const res = await request(app).get('/api/admin/stats/versions');
      assertEnvelopeError(res.body);
    });

    it('GET /api/admin/stats/platform — 401 (no auth) has envelope keys', async () => {
      const res = await request(app).get('/api/admin/stats/platform');
      assertEnvelopeError(res.body);
    });

    it('GET /api/admin/users — 401 (no auth) has envelope keys', async () => {
      const res = await request(app).get('/api/admin/users');
      assertEnvelopeError(res.body);
    });

    it('GET /api/admin/ai/costs — 401 (no auth) has envelope keys', async () => {
      const res = await request(app).get('/api/admin/ai/costs');
      assertEnvelopeError(res.body);
    });

    it('GET /api/admin/ai/community/:id/breakdown — 401 (no auth) has envelope keys', async () => {
      const res = await request(app).get('/api/admin/ai/community/000000000000000000000000/breakdown');
      assertEnvelopeError(res.body);
    });

    it('GET /api/admin/ai/community/:id/low-rated — 401 (no auth) has envelope keys', async () => {
      const res = await request(app).get('/api/admin/ai/community/000000000000000000000000/low-rated');
      assertEnvelopeError(res.body);
    });
  });

  // ── 404 handler returns {data, error, meta} ──────────────────────────────
  describe('404 handler returns envelope', () => {
    it('GET /api/nonexistent-route — 404 has envelope keys', async () => {
      const res = await request(app).get('/api/this-route-does-not-exist');
      expect(res.status).toBe(404);
      assertEnvelopeError(res.body);
    });
  });
});
