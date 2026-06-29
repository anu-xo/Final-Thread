import express from 'express';
import  { authMiddleware } from '../middleware/auth.js';
import  CommunityMember  from '../models/CommunityMember.js'; // Ensure you import your model
import {
  createCommunity,
  getCommunities,
  getCommunityBySlug,
  joinCommunity,
  leaveCommunity,
} from '../controllers/communityController.js';

const router = express.Router();

router.post('/', authMiddleware, createCommunity);
router.get('/', getCommunities);

// GET /communities/me — subscribed communities 
// (Placed above /:slug to avoid conflict)
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

// Dynamic slug routes go below static routes
router.get('/:slug', getCommunityBySlug);
router.post('/:slug/join', authMiddleware, joinCommunity);
router.post('/:slug/leave', authMiddleware, leaveCommunity);

export default router;