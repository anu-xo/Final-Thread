// middleware/requireCommunityMod.js
//
// Community-mod guard for post-level actions — mirrors the adminGuard/modGuard
// pattern from the Day 8 mod routes, but scoped to the post's own community
// instead of global admin. The post comes from the URL; fetch it and allow the
// caller through only if they are a mod/admin of post.community (or a site
// admin).
import mongoose from 'mongoose';
import Post from '../models/Post.js';
import CommunityMember from '../models/CommunityMember.js';

export default async function requireCommunityMod(req, res, next) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({
        data: null,
        error: 'Post not found',
        meta: {},
      });
    }

    const post = await Post.findById(req.params.id);

    if (!post || post.isRemoved) {
      return res.status(404).json({
        data: null,
        error: 'Post not found',
        meta: {},
      });
    }

    const membership = await CommunityMember.findOne({
      user: req.user._id,
      community: post.community,
    }).lean();

    const isMod = membership && ['mod', 'admin'].includes(membership.role);
    const isSiteAdmin = req.user.role === 'admin';

    if (!isMod && !isSiteAdmin) {
      return res.status(403).json({
        data: null,
        error: 'Forbidden — mod access required',
        meta: {},
      });
    }

    req.post = post;
    req.communityId = post.community;
    next();
  } catch (err) {
    next(err);
  }
}
