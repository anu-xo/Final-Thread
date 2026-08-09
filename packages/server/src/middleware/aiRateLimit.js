// server/src/middleware/aiRateLimit.js
import { checkDailyRateLimit } from './dailyRateLimit.js';

const AI_DAILY_LIMIT = 25;

async function aiRateLimit(req, res, next) {
  const { allowed } = await checkDailyRateLimit({
    prefix: 'ai:rate',
    identifier: req.user._id,
    limit: AI_DAILY_LIMIT,
  });

  if (!allowed) {
    return res.status(429).json({
      data: null,
      error: {
        message: 'Daily AI chat limit reached (25/day)',
      },
      meta: {},
    });
  }

  next();
}

export default aiRateLimit;
