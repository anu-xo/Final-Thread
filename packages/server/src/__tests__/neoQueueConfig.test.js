import { getRedisConfig } from '../jobs/redisConfig.js';

describe('getRedisConfig (shared Bull config)', () => {
  const original = process.env.REDIS_URL;

  afterEach(() => {
    process.env.REDIS_URL = original;
  });

  it('returns null when REDIS_URL is unset', () => {
    delete process.env.REDIS_URL;
    expect(getRedisConfig()).toBeNull();
  });

  it('parses host and port from a redis:// URL', () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const config = getRedisConfig();
    expect(config.host).toBe('localhost');
    expect(config.port).toBe(6379);
    expect(config.tls).toBeUndefined();
  });

  it('enables TLS for a rediss:// URL', () => {
    process.env.REDIS_URL = 'rediss://localhost:6380';
    const config = getRedisConfig();
    expect(config.host).toBe('localhost');
    expect(config.port).toBe(6380);
    expect(config.tls).toEqual({});
  });

  it('decodes the password from the URL', () => {
    process.env.REDIS_URL = 'redis://:s3cret%40pw@localhost:6379';
    const config = getRedisConfig();
    expect(config.password).toBe('s3cret@pw');
  });

  it('caps retryStrategy at 5 retries', () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const config = getRedisConfig();
    expect(config.retryStrategy(1)).toBe(200);
    expect(config.retryStrategy(5)).toBe(1000);
    expect(config.retryStrategy(6)).toBeNull();
    expect(config.maxRetriesPerRequest).toBeNull();
  });

  it('returns null for a malformed URL', () => {
    process.env.REDIS_URL = 'not-a-url';
    expect(getRedisConfig()).toBeNull();
  });
});
