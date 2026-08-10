import cron from 'node-cron';
import { sendWeeklyDigest } from '../services/emailService.js';
import { generateCommunityHighlights } from './digestHighlights.js';

export function registerDigestCron() {
  // Every Monday at 9:00 AM server time
  cron.schedule('0 9 * * 1', async () => {
    console.log('[digestCron] starting weekly digest run');
    try {
      // Phase 1: per-community AI highlight, once per community per week (cached).
      // Must complete before phase 2 so every email reuses the same text.
      const phase1 = await generateCommunityHighlights();
      console.log(
        `[digestCron] phase 1 highlights: ${phase1.generated} generated, ${phase1.skipped} skipped`
      );

      // Phase 2: per-user digest emails.
      const result = await sendWeeklyDigest();
      console.log(`[digestCron] sent ${result.sent} digests, ${result.skipped} skipped, ${result.failed} failed`);
    } catch (err) {
      console.error('[digestCron] fatal error', err);
    }
  });
}
