// Shared Bull redis config — single source of truth for every queue.
// Parses REDIS_URL (including rediss:// TLS) exactly as embeddingQueue did,
// so all Bull queues connect with identical options.

export const getRedisConfig = () => {
  if (!process.env.REDIS_URL) {
    return null;
  }

  try {
    const url = new URL(process.env.REDIS_URL);
    return {
      host: url.hostname,
      port: Number(url.port || 6379),
      password: url.password ? decodeURIComponent(url.password) : undefined,
      tls: url.protocol === 'rediss:' ? {} : undefined,
      retryStrategy: (times) => {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
      maxRetriesPerRequest: null,
    };
  } catch {
    return null;
  }
};
