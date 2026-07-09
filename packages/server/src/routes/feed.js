// packages/server/src/routes/feed.js
import express from 'express';
import Post from '../models/Post.js';
import CommunityMember from '../models/CommunityMember.js';
import Vote from '../models/Vote.js';
import authMiddleware from '../middleware/auth.js';
import { getSortStage } from '../services/sortService.js'; // Day 5 sort algorithms

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { sort = 'hot', cursor, limit = 20 } = req.query;
    const userId = req.user._id;

    // 1. Find subscribed communities
    const memberships = await CommunityMember.find({
      user: userId,
      role: { $ne: 'banned' }
    }).select('community').lean();

    const communityIds = memberships.map(m => m.community);

    if (communityIds.length === 0) {
      // Empty state: no subscriptions yet — don't error, return empty + a flag
      return res.json({
        data: [],
        error: null,
        meta: { cursor: null, hasMore: false, total: 0, noSubscriptions: true }
      });
    }

    // 2. Build cursor-paginated query scoped to those communities
    const query = { community: { $in: communityIds }, isRemoved: false };
    const sortStage = getSortStage(sort); // e.g., { hotScore: -1 } or { createdAt: -1 }
    const sortField = Object.keys(sortStage)[0] || 'createdAt';

    // Handle cursor pagination safely across custom sorting strategies
    if (cursor) {
      try {
        if (sortField === 'createdAt' || sortField === '_id') {
          // Pure chronological fallback
          query._id = { $lt: cursor };
        } else {
          // Complex cursor format expected: "sortValue_id" (e.g., "45.2_64a9b...")
          const [cursorValue, cursorId] = cursor.split('_');
          if (cursorValue && cursorId) {
            query.$or = [
              { [sortField]: { $lt: Number(cursorValue) } },
              { [sortField]: Number(cursorValue), _id: { $lt: cursorId } }
            ];
          } else {
            // Fallback if cursor structure is unparseable
            query._id = { $lt: cursor };
          }
        }
      } catch (parseError) {
        console.warn('Malformed pagination token received, resetting page window:', parseError);
      }
    }

    // Ensure _id sorting acts as a secondary tie-breaker for deterministic pagination
    const finalSortOrder = { ...sortStage, _id: -1 };

    const posts = await Post.find(query)
      .sort(finalSortOrder)
      .limit(Number(limit) + 1) // fetch one extra to determine if a next page exists
      .populate('author', 'username avatar')
      .populate('community', 'slug name icon')
      .lean();

    const hasMore = posts.length > Number(limit);
    const page = hasMore ? posts.slice(0, -1) : posts;

    // 3. Merge in the requesting user's own vote (resolves the Day 6 gap)
    const postIds = page.map(p => p._id);
    const userVotes = await Vote.find({
      user: userId,
      target: { $in: postIds },
      targetType: 'Post' // Match target schema type definition casing
    }).lean();

    const voteMap = new Map(userVotes.map(v => [v.target.toString(), v.value]));
    const enrichedPage = page.map(p => ({
      ...p,
      userVote: voteMap.get(p._id.toString()) || 0
    }));

    // 4. Formulate unique combined tracking cursor tokens for compound sorting indexes
    let nextCursor = null;
    if (hasMore && page.length > 0) {
      const lastPost = page[page.length - 1];
      nextCursor = sortField === 'createdAt' || sortField === '_id'
        ? lastPost._id.toString()
        : `${lastPost[sortField] || 0}_${lastPost._id}`;
    }

    res.json({
      data: enrichedPage,
      error: null,
      meta: {
        cursor: nextCursor,
        hasMore,
        total: null
      }
    });
  } catch (err) {
    console.error('GET /feed error:', err);
    res.status(500).json({ data: null, error: 'Failed to load feed', meta: null });
  }
});

export default router;