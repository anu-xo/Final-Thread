// packages/server/src/routes/communities.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rateLimiter.js';
import { sanitizeError } from '../utils/sanitizeError.js';
import CommunityMember from '../models/CommunityMember.js';
import Community from '../models/Community.js'; // Added since rules/flairs modify the Community document
import { COMMUNITY_ACCENT_KEYS } from '../models/Community.js';
import modGuard from '../middleware/modGuard.js';
import {
  createCommunity,
  getCommunities,
  getCommunityBySlug,
  joinCommunity,
  leaveCommunity,
} from '../controllers/communityController.js';

const router = express.Router();

// --- Static / Creation Routes ---
/**
 * @openapi
 * /communities:
 *   post:
 *     tags: [Communities]
 *     summary: Create a new community
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CommunityInput'
 *     responses:
 *       201:
 *         description: Community created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Community'
 *       409:
 *         description: Slug already taken
 */
router.post('/', authMiddleware, writeLimiter, createCommunity);

/**
 * @openapi
 * /communities:
 *   get:
 *     tags: [Communities]
 *     summary: List communities with pagination
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Last community ID from previous page
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 20
 *     responses:
 *       200:
 *         description: Paginated list of communities
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Community'
 *                     meta:
 *                       type: object
 *                       properties:
 *                         cursor:
 *                           type: string
 *                           nullable: true
 *                         hasMore:
 *                           type: boolean
 */
router.get('/', getCommunities);

/**
 * @openapi
 * /communities/me:
 *   get:
 *     tags: [Communities]
 *     summary: Get current user's subscribed communities
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscribed communities
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Community'
 *       401:
 *         description: Not authenticated
 */
// GET /communities/me — subscribed communities 
// (Placed above dynamic routes to avoid slug conflict)
// GET /communities/me — list communities the authenticated user has joined
/**
 * @openapi
 * /communities/me:
 *   get:
 *     tags: [Communities]
 *     summary: Get communities the current user has joined
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of joined communities
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/CommunitySummary'
 *       401:
 *         description: Not authenticated
 */
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

    res.json({ data: communities, error: null, meta: null });
  } catch (err) {
    res.status(500).json({ data: null, error: sanitizeError(err), meta: null });
  }
});

// --- Dynamic Slug Routes ---
/**
 * @openapi
 * /communities/{slug}:
 *   get:
 *     tags: [Communities]
 *     summary: Get community by slug
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Community detail with populated mods
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Community'
 *       404:
 *         description: Community not found
 */
router.get('/:slug', getCommunityBySlug);

/**
 * @openapi
 * /communities/{slug}/join:
 *   post:
 *     tags: [Communities]
 *     summary: Join a community
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Joined successfully (or already a member)
 *       403:
 *         description: Banned from this community
 *       404:
 *         description: Community not found
 */
router.post('/:slug/join', authMiddleware, joinCommunity);

/**
 * @openapi
 * /communities/{slug}/leave:
 *   post:
 *     tags: [Communities]
 *     summary: Leave a community
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Left successfully
 *       400:
 *         description: Not a member, or sole mod cannot leave
 *       404:
 *         description: Community not found
 */
router.post('/:slug/leave', authMiddleware, leaveCommunity);

// PUT /communities/:slug/rules — mod only
/**
 * @openapi
 * /communities/{slug}/rules:
 *   put:
 *     tags: [Communities]
 *     summary: Update community rules (mod only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rules:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     title:
 *                       type: string
 *                     description:
 *                       type: string
 *     responses:
 *       200:
 *         description: Updated community
 *       403:
 *         description: Not a moderator
 *       404:
 *         description: Community not found
 */
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
/**
 * @openapi
 * /communities/{slug}:
 *   put:
 *     tags: [Communities]
 *     summary: Update community settings (mod only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               aiEnabled:
 *                 type: boolean
 *               accentColor:
 *                 type: string
 *                 enum: [violet, pink, cyan, mint, amber, rose]
 *                 description: Curated community accent swatch
 *     responses:
 *       200:
 *         description: Updated community
 *       403:
 *         description: Not a moderator
 *       404:
 *         description: Community not found
 */
router.put('/:slug', authMiddleware, modGuard, async (req, res, next) => {
  try {
    const { aiEnabled, accentColor } = req.body;

    const update = {};
    if (typeof aiEnabled === 'boolean') update.aiEnabled = aiEnabled;
    if (accentColor && COMMUNITY_ACCENT_KEYS.includes(accentColor)) {
      update.accentColor = accentColor;
    }

    const community = await Community.findOneAndUpdate(
      { slug: req.params.slug },
      { $set: update },
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
/**
 * @openapi
 * /communities/{slug}/flairs:
 *   post:
 *     tags: [Communities]
 *     summary: Add a flair to a community (mod only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               color:
 *                 type: string
 *     responses:
 *       201:
 *         description: Flair added
 *       403:
 *         description: Not a moderator
 *       404:
 *         description: Community not found
 */
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