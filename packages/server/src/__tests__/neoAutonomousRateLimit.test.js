import { jest } from '@jest/globals';

const mockRedis = {
  incr: jest.fn(),
  expire: jest.fn().mockResolvedValue(1),
};

jest.unstable_mockModule('../config/redis.js', () => ({
  redis: mockRedis,
}));

const {
  checkNeoAutonomousLimit,
  NEO_AUTONOMOUS_DAILY_LIMIT,
} = await import('../middleware/neoAutonomousRateLimit.js');

describe('checkNeoAutonomousLimit', () => {
  const userId = '507f1f77bcf86cd799439011';
  const today = new Date().toISOString().slice(0, 10);
  const expectedKey = `neo:autonomous:${userId}:${today}`;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('defaults to the 10/day cap', () => {
    expect(NEO_AUTONOMOUS_DAILY_LIMIT).toBe(10);
  });

  it('increments the neo:autonomous daily key', async () => {
    mockRedis.incr.mockResolvedValue(1);
    await checkNeoAutonomousLimit(userId);
    expect(mockRedis.incr).toHaveBeenCalledWith(expectedKey);
  });

  it('sets the 24h TTL only on the first hit of the day', async () => {
    mockRedis.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    await checkNeoAutonomousLimit(userId);
    await checkNeoAutonomousLimit(userId);
    expect(mockRedis.expire).toHaveBeenCalledTimes(1);
    expect(mockRedis.expire).toHaveBeenCalledWith(expectedKey, 86400);
  });

  it('allows up to the daily limit', async () => {
    mockRedis.incr.mockResolvedValue(NEO_AUTONOMOUS_DAILY_LIMIT);
    const result = await checkNeoAutonomousLimit(userId);
    expect(result).toEqual({
      allowed: true,
      count: NEO_AUTONOMOUS_DAILY_LIMIT,
      limit: NEO_AUTONOMOUS_DAILY_LIMIT,
    });
  });

  it('blocks once the daily limit is exceeded', async () => {
    mockRedis.incr.mockResolvedValue(NEO_AUTONOMOUS_DAILY_LIMIT + 1);
    const result = await checkNeoAutonomousLimit(userId);
    expect(result.allowed).toBe(false);
  });
});
