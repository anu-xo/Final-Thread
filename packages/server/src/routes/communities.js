// packages/server/src/routes/communities.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import CommunityMember from '../models/CommunityMember.js';
import Community from '../models/Community.js'; // Added since rules/flairs modify the Community document
import { modGuard } from '../middleware/modGuard.js';
import {
  createCommunity,
  getCommunities,
  getCommunityBySlug,
  joinCommunity,
  leaveCommunity,
} from '../controllers/communityController.js';

const router = express.Router();

// --- Static / Creation Routes ---
router.post('/', authMiddleware, createCommunity);
router.get('/', getCommunities);

// GET /communities/me — subscribed communities 
// (Placed above dynamic routes to avoid slug conflict)
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const memberships = await CommunityMember.find({
      user: req.user._id,
      role: { $ne: 'banned' },
    })
      .populate('community', 'name slug members icon')
      .lean();

    const communities = memberships
      .filter((m) => m.community) // handle deleted communities
      .map((m) => m.community);

    res.json({ data: communities });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Dynamic Slug Routes ---
router.get('/:slug', getCommunityBySlug);
router.post('/:slug/join', authMiddleware, joinCommunity);
router.post('/:slug/leave', authMiddleware, leaveCommunity);

// PUT /communities/:slug/rules — mod only
router.put('/:slug/rules', authMiddleware, async (req, res, next) => {
  try {
    const community = await Community.findOne({ slug: req.params.slug });
    if (!community) return res.status(404).json({ data: null, error: 'Not found', meta: null });

    const membership = await CommunityMember.findOne({
      user: req.user.id,
      community: community._id,
    });

    const isMod = membership && ['mod', 'admin'].includes(membership.role);
    if (!isMod && req.user.role !== 'admin') {
      return res.status(403).json({ data: null, error: 'Forbidden', meta: null });
    }

    community.rules = req.body.rules; // array of { title, description }
    await community.save();
    res.json({ data: community, error: null, meta: null });
  } catch (err) {
    next(err);
  }
});

// POST /communities/:slug/flairs — mod only
// PUT /communities/:slug (mod-only, existing middleware from Day 8)
// PUT /communities/:slug (mod-only, existing middleware from Day 8)
router.put('/:slug', authMiddleware, modGuard, async (req, res, next) => {
  try {
    const { aiEnabled } = req.body;

    const community = await Community.findOneAndUpdate(
      { slug: req.params.slug },
      { $set: { aiEnabled } },
      { new: true }
    );

    if (!community) {
      return res.status(404).json({
        data: null,
        error: 'Not found',
        meta: null,
      });
    }

    res.json({
      data: community,
      error: null,
      meta: {},
    });
  } catch (err) {
    next(err);
  }
});
// POST /communities/:slug/flairs — mod only
router.post('/:slug/flairs', authMiddleware, async (req, res, next) => {
  try {
    const community = await Community.findOne({
      slug: req.params.slug,
    });

    if (!community) {
      return res.status(404).json({
        data: null,
        error: 'Not found',
        meta: null,
      });
    }

    const membership = await CommunityMember.findOne({
      user: req.user.id,
      community: community._id,
    });

    const isMod =
      membership && ['mod', 'admin'].includes(membership.role);

    if (!isMod && req.user.role !== 'admin') {
      return res.status(403).json({
        data: null,
        error: 'Forbidden',
        meta: null,
      });
    }

    // Expects req.body to contain flair properties
    community.flairs.push(req.body);

    await community.save();

    res.status(201).json({
      data: community,
      error: null,
      meta: null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;