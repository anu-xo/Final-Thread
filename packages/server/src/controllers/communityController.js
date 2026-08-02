import Community from '../models/Community.js';
import CommunityMember from '../models/CommunityMember.js';
import mongoose from 'mongoose';
import { sanitizeError } from '../utils/sanitizeError.js';

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

    res.status(201).json({ data: community, error: null, meta: null });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ data: null, error: 'Slug already taken.', meta: null });
    }
    res.status(500).json({ data: null, error: sanitizeError(err), meta: null });
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
      error: null,
      meta: { cursor: nextCursor, hasMore },
    });
  } catch (err) {
    res.status(500).json({ data: null, error: sanitizeError(err), meta: null });
  }
};

// GET /communities/:slug
export const getCommunityBySlug = async (req, res) => {
  try {
    const community = await Community.findOne({ slug: req.params.slug.toLowerCase() })
      .populate('mods', 'username avatar')
      .lean();

    if (!community) {
      return res.status(404).json({ data: null, error: 'Community not found.', meta: null });
    }

    res.json({ data: community, error: null, meta: null });
  } catch (err) {
    res.status(500).json({ data: null, error: sanitizeError(err), meta: null });
  }
};

// POST /communities/:slug/join
export const joinCommunity = async (req, res) => {
  try {
    const community = await Community.findOne({ slug: req.params.slug.toLowerCase() });
    if (!community) return res.status(404).json({ data: null, error: 'Community not found.', meta: null });

    // Check if banned
    const existingMembership = await CommunityMember.findOne({
      user: req.user._id,
      community: community._id,
    });

    if (existingMembership?.role === 'banned') {
      return res.status(403).json({ data: null, error: 'You are banned from this community.', meta: null });
    }

    if (existingMembership) {
      return res.status(200).json({ data: community, error: null, meta: null });
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

    // Notify live viewers of the new member count
    const io = req.app.get('io');
    if (io && updated) {
      io.to(`community:${updated.slug}`).emit('community:members', {
        slug: updated.slug,
        members: updated.members,
      });
    }

    res.json({ data: updated, error: null, meta: null });
  } catch (err) {
    res.status(500).json({ data: null, error: sanitizeError(err), meta: null });
  }
};

// POST /communities/:slug/leave
export const leaveCommunity = async (req, res) => {
  try {
    const community = await Community.findOne({ slug: req.params.slug.toLowerCase() });
    if (!community) return res.status(404).json({ data: null, error: 'Community not found.', meta: null });

    const membership = await CommunityMember.findOne({
      user: req.user._id,
      community: community._id,
    });

    if (!membership) {
      return res.status(400).json({ data: null, error: 'You are not a member of this community.', meta: null });
    }

    // Prevent sole mod from leaving
    if (membership.role === 'mod' && community.mods.length === 1) {
      return res.status(400).json({
        data: null,
        error: 'You are the only moderator. Transfer mod rights before leaving.',
        meta: null,
      });
    }

    await Promise.all([
      CommunityMember.deleteOne({ _id: membership._id }),
      Community.findByIdAndUpdate(community._id, {
        $inc: { members: -1 },
        $pull: { mods: req.user._id },
      }),
    ]);

    // Notify live viewers of the new member count
    const updated = await Community.findById(community._id).lean();
    const io = req.app.get('io');
    if (io && updated) {
      io.to(`community:${updated.slug}`).emit('community:members', {
        slug: updated.slug,
        members: updated.members,
      });
    }

    res.json({ data: { message: 'Left community successfully.' }, error: null, meta: null });
  } catch (err) {
    res.status(500).json({ data: null, error: sanitizeError(err), meta: null });
  }
};