import Community from '../models/Community.js';
import CommunityMember from '../models/CommunityMember.js';
import mongoose from 'mongoose';

// POST /communities
export const createCommunity = async (req, res) => {
  try {
    const { name, slug, description, rules } = req.body;

    // Slug uniqueness check
    const existing = await Community.findOne({ slug: slug.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'A community with that slug already exists.' });
    }

    const community = await Community.create({
      name,
      slug: slug.toLowerCase(),
      description,
      rules: rules || [],
      createdBy: req.user._id,
      mods: [req.user._id],
      members: 1, // creator auto-joins
      aiEnabled: true,
    });

    // Auto-join creator as mod
    await CommunityMember.create({
      user: req.user._id,
      community: community._id,
      role: 'mod',
    });

    res.status(201).json({ data: community });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Slug already taken.' });
    }
    res.status(500).json({ error: err.message });
  }
};

// GET /communities?cursor=&limit=
export const getCommunities = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const cursor = req.query.cursor; // last _id from previous page

    const query = cursor
      ? { _id: { $gt: new mongoose.Types.ObjectId(cursor) } }
      : {};

    const communities = await Community.find(query)
      .sort({ _id: 1 })
      .limit(limit)
      .select('name slug description members icon banner createdAt')
      .lean();

    const hasMore = communities.length === limit;
    const nextCursor = hasMore ? communities[communities.length - 1]._id : null;

    res.json({
      data: communities,
      meta: { cursor: nextCursor, hasMore },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /communities/:slug
export const getCommunityBySlug = async (req, res) => {
  try {
    const community = await Community.findOne({ slug: req.params.slug.toLowerCase() })
      .populate('mods', 'username avatar')
      .lean();

    if (!community) {
      return res.status(404).json({ error: 'Community not found.' });
    }

    res.json({ data: community });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /communities/:slug/join
export const joinCommunity = async (req, res) => {
  try {
    const community = await Community.findOne({ slug: req.params.slug.toLowerCase() });
    if (!community) return res.status(404).json({ error: 'Community not found.' });

    // Check if banned
    const existingMembership = await CommunityMember.findOne({
      user: req.user._id,
      community: community._id,
    });

    if (existingMembership?.role === 'banned') {
      return res.status(403).json({ error: 'You are banned from this community.' });
    }

    if (existingMembership) {
      return res.status(200).json({ data: community, message: 'Already a member.' });
    }

    // Create membership + increment counter atomically
    await Promise.all([
      CommunityMember.create({
        user: req.user._id,
        community: community._id,
        role: 'member',
      }),
      Community.findByIdAndUpdate(community._id, { $inc: { members: 1 } }),
    ]);

    const updated = await Community.findById(community._id).lean();
    res.json({ data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /communities/:slug/leave
export const leaveCommunity = async (req, res) => {
  try {
    const community = await Community.findOne({ slug: req.params.slug.toLowerCase() });
    if (!community) return res.status(404).json({ error: 'Community not found.' });

    const membership = await CommunityMember.findOne({
      user: req.user._id,
      community: community._id,
    });

    if (!membership) {
      return res.status(400).json({ error: 'You are not a member of this community.' });
    }

    // Prevent sole mod from leaving
    if (membership.role === 'mod' && community.mods.length === 1) {
      return res.status(400).json({
        error: 'You are the only moderator. Transfer mod rights before leaving.',
      });
    }

    await Promise.all([
      CommunityMember.deleteOne({ _id: membership._id }),
      Community.findByIdAndUpdate(community._id, {
        $inc: { members: -1 },
        $pull: { mods: req.user._id },
      }),
    ]);

    res.json({ data: { message: 'Left community successfully.' } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};