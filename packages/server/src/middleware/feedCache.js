// packages/server/src/middleware/feedCache.js
import redis from '../config/redis.js'; // your existing ioredis TLS client
// Ensure you import your CommunityMember model here for the invalidation helper
import CommunityMember from '../models/CommunityMember.js'; 

/**
 * Middleware to cache the first page of a user's feed
 */
export async function feedCache(req, res, next) {
  try {
    const { sort = 'hot', cursor } = req.query;
    if (cursor) return next(); // only cache the first page of each sort tab

    // Ensure req.user exists before accessing _id to prevent runtime crashes
    const userId = req.user?._id;
    if (!userId) return next();

    const key = `feed:${userId}:${sort}`;
    const cached = await redis.get(key);
    
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      redis.set(key, JSON.stringify(body), 'EX', 60); // TTL 60s
      return originalJson(body);
    };
    
    next();
  } catch (error) {
    // Fail gracefully: log the Redis error and move to the database query instead of crashing
    console.error('Redis cache error:', error);
    next();
  }
}

/**
 * Invalidation helper to clear cached feeds for all community members
 * Call this in your Post post-save hook
 */
export async function invalidateFeedCacheForCommunity(communityId) {
  try {
    const members = await CommunityMember.find({ community: communityId }).select('user').lean();
    if (!members.length) return;

    // Scan Redis keys concurrently for all members
    const scanPromises = members.map(async (m) => {
      const userKeys = [];
      const stream = redis.scanStream({ match: `feed:${m.user}:*` });
      
      for await (const foundKeys of stream) {
        userKeys.push(...foundKeys);
      }
      return userKeys;
    });

    const results = await Promise.all(scanPromises);
    const keysToDel = results.flat();

    // Delete the keys if any were found
    if (keysToDel.length > 0) {
      await redis.del(...keysToDel);
    }
  } catch (error) {
    console.error('Error invalidating community feed cache:', error);
  }
}

// Default export the middleware, named export for the helper utility
export default feedCache;