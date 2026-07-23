import cron from 'node-cron';
import { sendWeeklyDigest } from '../services/emailService.js';

export function registerDigestCron() {
  // Every Monday at 9:00 AM server time
  cron.schedule('0 9 * * 1', async () => {
    console.log('[digestCron] starting weekly digest run');
    try {
      const result = await sendWeeklyDigest();
      console.log(`[digestCron] sent ${result.sent} digests, ${result.skipped} skipped, ${result.failed} failed`);
    } catch (err) {
      console.error('[digestCron] fatal error', err);
    }
  });
}
