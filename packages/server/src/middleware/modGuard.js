import Community from '../models/Community.js';
import CommunityMember from '../models/CommunityMember.js';

async function modGuard(req, res, next) {
  try {
    let communityId = req.params.communityId || req.body.communityId;

    // If the route uses :slug, resolve it to a community ID
    if (!communityId && req.params.slug) {
      const community = await Community.findOne({
        slug: req.params.slug,
      }).select('_id');

      if (!community) {
        return res.status(404).json({
          data: null,
          error: 'Community not found',
          meta: null,
        });
      }

      communityId = community._id;
    }

    if (!communityId) {
      return res.status(400).json({
        data: null,
        error: 'communityId required',
        meta: null,
      });
    }

    const membership = await CommunityMember.findOne({
      user: req.user._id,
      community: communityId,
    }).lean();

    const isMod =
      membership &&
      ['mod', 'admin'].includes(membership.role);

    const isSiteAdmin = req.user.role === 'admin';

    if (!isMod && !isSiteAdmin) {
      return res.status(403).json({
        data: null,
        error: 'Forbidden — mod access required',
        meta: null,
      });
    }

    req.membership = membership;
    req.communityId = communityId;

    next();
  } catch (err) {
    next(err);
  }
}

export default modGuard;