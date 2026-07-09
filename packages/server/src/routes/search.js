import express from 'express';
import Post from '../models/Post.js';
import Community from '../models/Community.js';
import User from '../models/User.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

const SEARCH_INDEX = 'default';

function normalizeLimit(limitValue) {
  const parsed = Number.parseInt(limitValue, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return 10;
  }

  return Math.min(parsed, 25);
}

function buildSearchPipeline(query, path, limit) {
  return [
    {
      $search: {
        index: SEARCH_INDEX,
        text: {
          query,
          path,
        },
      },
    },
    { $limit: limit },
  ];
}

function buildPostPipeline(query, limit) {
  return buildSearchPipeline(query, ['title', 'body'], limit).concat({
    $project: {
      title: 1,
      body: 1,
      content: 1,
      author: 1,
      community: 1,
      score: 1,
      commentCount: 1,
      hotScore: 1,
      risingScore: 1,
      flair: 1,
      createdAt: 1,
    },
  });
}

function buildCommunityPipeline(query, limit) {
  return buildSearchPipeline(query, ['name', 'description'], limit).concat({
    $project: {
      name: 1,
      slug: 1,
      description: 1,
      members: 1,
      icon: 1,
      banner: 1,
      createdAt: 1,
    },
  });
}

function buildUserPipeline(query, limit) {
  return buildSearchPipeline(query, ['username'], limit).concat({
    $project: {
      username: 1,
      role: 1,
      karma: 1,
      createdAt: 1,
    },
  });
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { q, type = 'all', limit = 10 } = req.query;
    const trimmedQuery = typeof q === 'string' ? q.trim() : '';

    if (trimmedQuery.length < 2) {
      return res.json({
        data: { posts: [], communities: [], users: [] },
        error: null,
        meta: null,
      });
    }

    const pageLimit = normalizeLimit(limit);
    const searchType = String(type).toLowerCase();
    const results = { posts: [], communities: [], users: [] };

    const searches = [];

    if (searchType === 'all' || searchType === 'posts') {
      searches.push(
        Post.aggregate(buildPostPipeline(trimmedQuery, pageLimit)).then((docs) => {
          results.posts = docs;
        })
      );
    }

    if (searchType === 'all' || searchType === 'communities') {
      searches.push(
        Community.aggregate(buildCommunityPipeline(trimmedQuery, pageLimit)).then((docs) => {
          results.communities = docs;
        })
      );
    }

    if (searchType === 'all' || searchType === 'users') {
      searches.push(
        User.aggregate(buildUserPipeline(trimmedQuery, pageLimit)).then((docs) => {
          results.users = docs;
        })
      );
    }

    await Promise.all(searches);

    return res.json({
      data: results,
      error: null,
      meta: null,
    });
  } catch (err) {
    console.error('GET /search error:', err);
    return res.status(500).json({
      data: { posts: [], communities: [], users: [] },
      error: 'Failed to search',
      meta: null,
    });
  }
});

export default router;