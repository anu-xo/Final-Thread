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
process.env.NODE_ENV = 'test';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongoServer = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongoServer.getUri();
process.env.REDIS_URL = 'redis://localhost:6379';

const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { default: app } = await import('../app.js');

describe('Security Headers (Helmet)', () => {
  beforeAll(async () => {
    while (mongoose.connection.readyState !== 1) {
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
    await mongoServer.stop();
  });

  let res;

  beforeAll(async () => {
    res = await request(app).get('/api/health');
  });

  // ── X-Content-Type-Options ──────────────────────────────────────────────
  describe('X-Content-Type-Options', () => {
    it('sets X-Content-Type-Options to nosniff', () => {
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  // ── X-Frame-Options ─────────────────────────────────────────────────────
  describe('X-Frame-Options', () => {
    it('sets X-Frame-Options to DENY', () => {
      expect(res.headers['x-frame-options']).toBe('DENY');
    });
  });

  // ── Strict-Transport-Security ───────────────────────────────────────────
  describe('Strict-Transport-Security', () => {
    it('sets HSTS with max-age=63072000', () => {
      const hsts = res.headers['strict-transport-security'];
      expect(hsts).toBeDefined();
      expect(hsts).toContain('max-age=63072000');
    });

    it('includes includeSubDomains directive', () => {
      const hsts = res.headers['strict-transport-security'];
      expect(hsts).toContain('includeSubDomains');
    });

    it('includes preload directive', () => {
      const hsts = res.headers['strict-transport-security'];
      expect(hsts).toContain('preload');
    });
  });

  // ── Referrer-Policy ─────────────────────────────────────────────────────
  describe('Referrer-Policy', () => {
    it('sets Referrer-Policy to strict-origin-when-cross-origin', () => {
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });
  });

  // ── Permissions-Policy ──────────────────────────────────────────────────
  describe('Permissions-Policy', () => {
    it('sets Permissions-Policy header', () => {
      expect(res.headers['permissions-policy']).toBeDefined();
    });

    it('disables camera', () => {
      const pp = res.headers['permissions-policy'];
      expect(pp).toContain('camera=()');
    });

    it('disables microphone', () => {
      const pp = res.headers['permissions-policy'];
      expect(pp).toContain('microphone=()');
    });

    it('disables geolocation', () => {
      const pp = res.headers['permissions-policy'];
      expect(pp).toContain('geolocation=()');
    });
  });

  // ── Content-Security-Policy ─────────────────────────────────────────────
  describe('Content-Security-Policy', () => {
    let csp;

    beforeAll(() => {
      csp = res.headers['content-security-policy'];
    });

    it('sets Content-Security-Policy header', () => {
      expect(csp).toBeDefined();
    });

    it('includes default-src self', () => {
      expect(csp).toContain("default-src 'self'");
    });

    it('includes script-src self', () => {
      expect(csp).toContain("script-src 'self'");
    });

    it('includes style-src self', () => {
      expect(csp).toContain("style-src 'self'");
    });

    it('includes img-src with Cloudinary', () => {
      expect(csp).toContain('img-src');
      expect(csp).toContain("'self'");
      expect(csp).toContain('https://res.cloudinary.com');
    });

    it('includes font-src self', () => {
      expect(csp).toContain("font-src 'self'");
    });

    it('includes connect-src with self', () => {
      expect(csp).toContain('connect-src');
      expect(csp).toContain("'self'");
    });

    it('includes connect-src with Cloudinary API', () => {
      expect(csp).toContain('https://api.cloudinary.com');
    });

    it('includes connect-src with API origin', () => {
      expect(csp).toContain('https://api.threadverse.app');
    });

    it('includes connect-src with WebSocket API', () => {
      expect(csp).toContain('wss://api.threadverse.app');
    });

    it('includes connect-src with Sentry', () => {
      expect(csp).toContain('https://*.sentry.io');
    });

    it('includes frame-src none', () => {
      expect(csp).toContain("frame-src 'none'");
    });

    it('includes object-src none', () => {
      expect(csp).toContain("object-src 'none'");
    });

    it('includes base-uri self', () => {
      expect(csp).toContain("base-uri 'self'");
    });

    it('includes form-action self', () => {
      expect(csp).toContain("form-action 'self'");
    });

    it('includes upgrade-insecure-requests', () => {
      expect(csp).toContain('upgrade-insecure-requests');
    });
  });

  // ── Additional Headers ──────────────────────────────────────────────────
  describe('Additional security headers', () => {
    it('sets X-Request-Id', () => {
      expect(res.headers['x-request-id']).toBeDefined();
    });

    it('does not expose server version', () => {
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });
});
