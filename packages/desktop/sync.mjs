import { ipcMain } from 'electron';
import Store from 'electron-store';

const embeddingCache = new Store({ name: 'embedding-cache' });

const MAX_CACHE_ENTRIES = 200;

/**
 * embedAndCachePosts(communityId, posts)
 * Merges fetched posts into the per-community embedding cache (LRU cap 200).
 * Existing posts with matching IDs get their access timestamp refreshed.
 */
ipcMain.handle('embedAndCachePosts', async (_event, communityId, posts) => {
  if (typeof communityId !== 'string' || !communityId) {
    throw new Error('embedAndCachePosts: communityId must be a non-empty string');
  }
  if (!Array.isArray(posts)) {
    throw new Error('embedAndCachePosts: posts must be an array');
  }

  const key = `embeddingCache:${communityId}`;
  const existing = embeddingCache.get(key, []);

  const incoming = posts.map((p) => ({
    postId: p._id ?? p.postId,
    title: p.title ?? '',
    text: p.body ?? p.content ?? '',
    lastAccessed: Date.now(),
  }));

  const existingMap = new Map(existing.map((e) => [e.postId, e]));

  for (const entry of incoming) {
    existingMap.set(entry.postId, entry);
  }

  const merged = Array.from(existingMap.values())
    .sort((a, b) => b.lastAccessed - a.lastAccessed)
    .slice(0, MAX_CACHE_ENTRIES);

  embeddingCache.set(key, merged);

  return { cached: merged.length };
});

/**
 * logSyncBreadcrumb(data)
 * Sends a Sentry breadcrumb from the main process (Day 3/DO Sentry init).
 */
ipcMain.handle('logSyncBreadcrumb', async (_event, data) => {
  try {
    const Sentry = await import('@sentry/electron');
    Sentry.addBreadcrumb({
      category: 'background-sync',
      data,
      level: 'info',
    });
  } catch {
    // Sentry not initialised in dev — swallow silently
  }
});
