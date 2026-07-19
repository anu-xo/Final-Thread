// packages/server/src/services/adminAiService.js

import PostEmbedding from '../models/PostEmbedding.js';
import AIConversation from '../models/AIConversation.js';
import AIMessage from '../models/AIMessage.js';

export async function getCommunityAiBreakdown(communityId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [postsIndexed, chatsToday, avgTokensResult] = await Promise.all([
    PostEmbedding.countDocuments({ communityId }),
    AIConversation.countDocuments({
      community: communityId,
      createdAt: { $gte: startOfDay },
    }),
    AIMessage.aggregate([
      {
        $lookup: {
          from: 'aiconversations',
          localField: 'conversation',
          foreignField: '_id',
          as: 'conv',
        },
      },
      { $unwind: '$conv' },
      { $match: { 'conv.community': communityId } },
      {
        $group: {
          _id: null,
          avgTokens: { $avg: '$tokensUsed' },
        },
      },
    ]),
  ]);

  return {
    postsIndexed,
    chatsToday,
    avgTokensPerChat: avgTokensResult[0]?.avgTokens || 0,
  };
}

export async function getLowRatedMessages(communityId, limit = 20) {
  return AIMessage.aggregate([
    { $match: { rating: -1 } },
    {
      $lookup: {
        from: 'aiconversations',
        localField: 'conversation',
        foreignField: '_id',
        as: 'conv',
      },
    },
    { $unwind: '$conv' },
    { $match: { 'conv.community': communityId } },
    { $sort: { createdAt: -1 } },
    { $limit: limit },
  ]);
}