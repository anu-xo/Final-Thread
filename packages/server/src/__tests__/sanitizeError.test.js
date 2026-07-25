import { sanitizeError } from '../utils/sanitizeError.js';

describe('sanitizeError', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('in development mode', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('returns raw error message', () => {
      const err = new Error('Cannot find user in collection "users"');
      expect(sanitizeError(err)).toBe('Cannot find user in collection "users"');
    });

    it('returns fallback when no message', () => {
      expect(sanitizeError({})).toBe('Internal server error');
    });
  });

  describe('in production mode', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('returns generic message for 500 errors', () => {
      const err = new Error('Internal MongoDB error');
      err.status = 500;
      expect(sanitizeError(err)).toBe('Internal server error');
    });

    it('masks MongoDB ValidationError', () => {
      const err = new Error('Validation failed: path is required');
      err.name = 'ValidationError';
      expect(sanitizeError(err)).toBe('Internal server error');
    });

    it('masks MongoDB CastError', () => {
      const err = new Error('Cast to ObjectId failed for value "abc" at path "_id"');
      err.name = 'CastError';
      expect(sanitizeError(err)).toBe('Internal server error');
    });

    it('masks MongoDB error codes', () => {
      const err = new Error('duplicate key error collection: threadverse.users');
      err.code = 11000;
      expect(sanitizeError(err)).toBe('Internal server error');
    });

    it('masks JWT errors', () => {
      const err = new Error('jwt malformed');
      err.name = 'JsonWebTokenError';
      expect(sanitizeError(err)).toBe('Authentication error');
    });

    it('masks token expiry errors', () => {
      const err = new Error('jwt expired');
      err.name = 'TokenExpiredError';
      expect(sanitizeError(err)).toBe('Authentication error');
    });

    it('preserves 4xx operational errors', () => {
      const err = new Error('Slug already taken');
      err.status = 409;
      expect(sanitizeError(err)).toBe('Slug already taken');
    });

    it('uses custom fallback', () => {
      const err = new Error('something went wrong');
      err.status = 500;
      expect(sanitizeError(err, 'Custom fallback')).toBe('Custom fallback');
    });

    it('returns fallback for unknown 500 errors', () => {
      const err = new Error('Secret internal details');
      err.status = 500;
      expect(sanitizeError(err)).toBe('Internal server error');
    });
  });
});
