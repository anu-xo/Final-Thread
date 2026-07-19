import ActivityEvent from '../models/ActivityEvent.js';

export async function logActivity(event, req, { userId, ...meta } = {}) {
  try {
    await ActivityEvent.create({
      user: userId || req.user?.id || req.user?._id || null,
      event,
      platform: req.platform || 'web',
      appVersion: req.appVersion || null,
      meta,
    });
  } catch (err) {
    console.error(`[ActivityLog] failed to log "${event}":`, err.message);
  }
}
