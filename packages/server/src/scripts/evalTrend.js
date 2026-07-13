import mongoose from 'mongoose';
import EvalResult from '../models/EvalResult.js';

async function getTrend(communityId) {
  return EvalResult.aggregate([
    { $match: { community: new mongoose.Types.ObjectId(communityId) } },
    {
      $group: {
        _id: { promptVersion: '$promptVersion', day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } },
        avgRelevance: { $avg: '$relevance' },
        avgFaithfulness: { $avg: '$faithfulness' },
      },
    },
    { $sort: { '_id.day': 1 } },
  ]);
}

export { getTrend };