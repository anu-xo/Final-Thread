// packages/server/src/services/desktopRetrieval.js
//
// Simulates the desktop Electron renderer's retrieval path:
//   1. Seeding an in-memory LRU cache from PostEmbedding (what sync.mjs does via IPC)
//   2. Retrieving context via local cosine similarity (what the renderer would do
//      instead of hitting $vectorSearch on Atlas)
//
// This lets the eval harness measure quality when retrieval comes from the local
// cache rather than a live Atlas vector-search query.

import PostEmbedding from '../models/PostEmbedding.js';
import { LRUCache } from '../utils/lruCache.js';

const MAX_CACHE_ENTRIES = 200;

/** Per-community cache instances, mirroring sync.mjs's `embeddingCache:<communityId>` keys. */
const communityCaches = new Map();

function getCache(communityId) {
  if (!communityCaches.has(communityId)) {
    communityCaches.set(communityId, new LRUCache(MAX_CACHE_ENTRIES));
  }
  return communityCaches.get(communityId);
}

// ── Seeding ─────────────────────────────────────────────────────────────────

/**
 * Seed the LRU cache for a community from PostEmbedding documents.
 * Mirrors what `embedAndCachePosts` in sync.mjs does: merges incoming posts,
 * sorts by lastAccessed, caps at MAX_CACHE_ENTRIES.
 */
export async function seedCache(communityId, limit = MAX_CACHE_ENTRIES) {
  const docs = await PostEmbedding.find({ communityId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const cache = getCache(communityId.toString());
  for (const doc of docs) {
    const key = (doc.postId ?? doc._id).toString();
    cache.set(key, {
      postId: key,
      text: doc.text,
      embedding: doc.embedding,
      type: doc.type ?? 'post',
    });
  }

  return cache.size;
}

/**
 * Seed all communities referenced in PostEmbedding.
 * Returns a map of communityId → cached entry count.
 */
export async function seedAllCaches() {
  const communityIds = await PostEmbedding.distinct('communityId');
  const counts = new Map();

  for (const cid of communityIds) {
    const n = await seedCache(cid);
    counts.set(cid.toString(), n);
  }

  return counts;
}

// ── Retrieval ───────────────────────────────────────────────────────────────

/** Cosine similarity between two equal-length vectors. */
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

/**
 * Retrieve top-K context chunks from the local LRU cache using cosine
 * similarity — the same path the Electron renderer would take.
 *
 * @param {number[]} queryEmbedding - 768-dim vector from embedQuery()
 * @param {string} communityId
 * @param {number} limit - top-K to return (default 8, matching server retrievalContext)
 * @returns {Array<{ postId: string, text: string, score: number, type: string }>}
 */
export function retrieveFromCache(queryEmbedding, communityId, limit = 8) {
  const cache = getCache(communityId.toString());
  if (cache.size === 0) return [];

  const scored = cache.values().map((entry) => ({
    ...entry,
    score: cosineSimilarity(queryEmbedding, entry.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * Build the full RAG prompt using cache-based retrieval.
 * Drop-in replacement for aiService.buildRagPrompt() that swaps $vectorSearch
 * for local cosine similarity against the LRU cache.
 *
 * Returns the same shape: { prompt: string, sources: Array<{ postId, title }> }
 */
export async function buildDesktopRagPrompt({ message, communityId, embedQuery, buildPrompt, Community }) {
  const community = await Community.findById(communityId).select('name');
  if (!community) throw new Error(`Community not found: ${communityId}`);

  const queryEmbedding = await embedQuery(message);
  const contextChunks = retrieveFromCache(queryEmbedding, communityId);

  const prompt = buildPrompt({
    communityName: community.name,
    contextChunks,
    history: [],
    message,
  });

  const sources = contextChunks.map((chunk) => ({
    postId: chunk.postId,
    title: chunk.text.split('\n')[0] || 'Untitled',
  }));

  return { prompt, sources, retrievalSource: 'local-cache', cacheSize: getCache(communityId.toString()).size };
}

// ── Stats / introspection ───────────────────────────────────────────────────

export function getCacheStats() {
  const stats = {};
  for (const [cid, cache] of communityCaches.entries()) {
    stats[cid] = { entries: cache.size, maxEntries: MAX_CACHE_ENTRIES };
  }
  return stats;
}

export function resetCaches() {
  communityCaches.clear();
}
