import Bull from 'bull';
import { getRedisConfig } from './redisConfig.js';

// Autonomous Neo layer queue. Both Neo features (auto-reply comment on
// @mention, thread summary) are dispatched here so the comment-creation and
// summarize-request API responses never block on a Gemini call.
let neoAutonomousQueue;

export const getNeoAutonomousQueue = () => {
  if (!neoAutonomousQueue) {
    const redisConfig = getRedisConfig();
    neoAutonomousQueue = new Bull('neo-autonomous', redisConfig ? { redis: redisConfig } : { redis: { host: '127.0.0.1', port: 6379 } });
  }
  return neoAutonomousQueue;
};
