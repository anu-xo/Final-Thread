import request from 'supertest';
import mongoose from 'mongoose';
import app, { redis } from '../app.js';

// Routes that return JSON and should have {data, error, meta} envelope.
// We skip: /api/health (monitoring), /api/debug/* (dev helpers), /sitemap.xml (XML),
// /api/email/* (plain text), and SSE endpoints (no JSON body).
const ENVELOPED_ROUTES = [
  { method: 'get',  path: '/api/desktop/version' },
  { method: 'get',  path: '/api/communities' },
  { method: 'get',  path: '/api/feed' },
  { method: 'get',  path: '/api/posts' },
  { method: 'get',  path: '/api/search' },
  { method: 'get',  path: '/api/notifications' },
  { method: 'get',  path: '/api/notifications/unread-count' },
  { method: 'get',  path: '/api/ai/health' },
];

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

  describe('Every JSON route returns {data, error, meta}', () => {
    for (const { method, path } of ENVELOPED_ROUTES) {
      it(`${method.toUpperCase()} ${path} — top-level keys are exactly {data, error, meta}`, async () => {
        const res = await request(app)[method](path);
        const keys = Object.keys(res.body).sort();
        expect(keys).toEqual(['data', 'error', 'meta']);
      });
    }
  });

  describe('Auth routes return {data, error, meta}', () => {
    it('POST /api/auth/register — 400 has envelope keys', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({}); // empty body → 400
      const keys = Object.keys(res.body).sort();
      expect(keys).toEqual(['data', 'error', 'meta']);
      expect(res.body.data).toBeNull();
      expect(typeof res.body.error).toBe('string');
    });

    it('POST /api/auth/login — 401 has envelope keys', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@test.com', password: 'wrong' });
      const keys = Object.keys(res.body).sort();
      expect(keys).toEqual(['data', 'error', 'meta']);
      expect(res.body.data).toBeNull();
      expect(typeof res.body.error).toBe('string');
    });

    it('POST /api/auth/refresh — 401 has envelope keys', async () => {
      const res = await request(app)
        .post('/api/auth/refresh');
      const keys = Object.keys(res.body).sort();
      expect(keys).toEqual(['data', 'error', 'meta']);
      expect(res.body.data).toBeNull();
      expect(typeof res.body.error).toBe('string');
    });
  });

  describe('Post routes return {data, error, meta}', () => {
    it('GET /api/posts — success has envelope keys', async () => {
      const res = await request(app).get('/api/posts');
      const keys = Object.keys(res.body).sort();
      expect(keys).toEqual(['data', 'error', 'meta']);
      expect(res.body.error).toBeNull();
      expect(res.body.data).toHaveProperty('posts');
      expect(res.body.data).toHaveProperty('nextCursor');
      expect(res.body.data).toHaveProperty('hasMore');
    });

    it('POST /api/posts — 401 (no auth) has envelope keys', async () => {
      const res = await request(app)
        .post('/api/posts')
        .send({});
      const keys = Object.keys(res.body).sort();
      expect(keys).toEqual(['data', 'error', 'meta']);
      expect(res.body.data).toBeNull();
      expect(typeof res.body.error).toBe('string');
    });

    it('GET /api/posts/:id — invalid id has envelope keys', async () => {
      const res = await request(app).get('/api/posts/not-a-valid-id');
      const keys = Object.keys(res.body).sort();
      expect(keys).toEqual(['data', 'error', 'meta']);
    });
  });

  describe('Community routes return {data, error, meta}', () => {
    it('GET /api/communities — success has envelope keys', async () => {
      const res = await request(app).get('/api/communities');
      const keys = Object.keys(res.body).sort();
      expect(keys).toEqual(['data', 'error', 'meta']);
      expect(res.body.error).toBeNull();
    });

    it('GET /api/communities/nonexistent-slug — 404 has envelope keys', async () => {
      const res = await request(app).get('/api/communities/this-community-definitely-does-not-exist-12345');
      const keys = Object.keys(res.body).sort();
      expect(keys).toEqual(['data', 'error', 'meta']);
      expect(res.body.data).toBeNull();
      expect(typeof res.body.error).toBe('string');
    });
  });

  describe('AI routes return {data, error, meta}', () => {
    it('GET /api/ai/health — success has envelope keys', async () => {
      const res = await request(app).get('/api/ai/health');
      const keys = Object.keys(res.body).sort();
      expect(keys).toEqual(['data', 'error', 'meta']);
    });

    it('POST /api/ai/chat — 401 (no auth) has envelope keys with string error', async () => {
      const res = await request(app)
        .post('/api/ai/chat')
        .send({});
      const keys = Object.keys(res.body).sort();
      expect(keys).toEqual(['data', 'error', 'meta']);
      expect(res.body.data).toBeNull();
      expect(typeof res.body.error).toBe('string');
    });
  });

  describe('Vote routes return {data, error, meta}', () => {
    it('POST /api/votes — 401 (no auth) has envelope keys', async () => {
      const res = await request(app)
        .post('/api/votes')
        .send({});
      const keys = Object.keys(res.body).sort();
      expect(keys).toEqual(['data', 'error', 'meta']);
      expect(res.body.data).toBeNull();
      expect(typeof res.body.error).toBe('string');
    });
  });
});
