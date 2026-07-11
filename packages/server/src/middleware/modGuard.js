// packages/server/src/middleware/modGuard.js
import CommunityMember from '../models/CommunityMember.js';

async function modGuard(req, res, next) {
  try {
    const communityId = req.params.communityId || req.body.communityId;
    if (!communityId) {
      return res.status(400).json({ data: null, error: 'communityId required', meta: null });
    }

    const membership = await CommunityMember.findOne({
      user: req.user.id,
      community: communityId,
    }).lean();

    const isMod = membership && ['mod', 'admin'].includes(membership.role);
    const isSiteAdmin = req.user.role === 'admin';

    if (!isMod && !isSiteAdmin) {
      return res.status(403).json({ data: null, error: 'Forbidden — mod access required', meta: null });
    }

    req.membership = membership;
    next();
  } catch (err) {
    next(err);
  }
}

export default modGuard;