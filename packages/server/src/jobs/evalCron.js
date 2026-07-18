const cron = require('node-cron');
const axios = require('axios');
const EvalResult = require('../models/EvalResult'); // new schema, see below
const { runEvalQuestion } = require('../services/aiService');

const TEST_QUESTIONS = [
  // 30 questions across 3 communities — 10 each, mix of factual + edge-case
  // load these from a JSON fixture rather than hardcoding here:
];

function scheduleNightlyEval() {
  // Runs at 2:00 AM server time every day
  cron.schedule('0 2 * * *', async () => {
    console.log('[evalCron] starting nightly AI eval run');
    const results = [];

    for (const q of TEST_QUESTIONS) {
      try {
        const { response, sources, groundedness, relevance } = await runEvalQuestion(q);
        results.push({
          question: q.text,
          communityId: q.communityId,
          groundedness,
          relevance,
          hasCitation: sources.length > 0,
          createdAt: new Date(),
        });
      } catch (err) {
        console.error('[evalCron] question failed:', q.text, err.message);
      }
    }

    await EvalResult.insertMany(results);

    const avgScore =
      results.reduce((sum, r) => sum + (r.groundedness + r.relevance) / 2, 0) / (results.length || 1);

    if (avgScore < 3.0) {
      await notifyDiscord(avgScore, results);
    }

    console.log(`[evalCron] complete. avg score: ${avgScore.toFixed(2)}`);
  });
}

async function notifyDiscord(avgScore, results) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const lowScoring = results.filter((r) => (r.groundedness + r.relevance) / 2 < 3.0);

  await axios.post(webhookUrl, {
    content:
      `⚠️ **ThreadVerse AI eval alert**\nAverage score dropped to **${avgScore.toFixed(2)}** (threshold: 3.0)\n` +
      `${lowScoring.length} of ${results.length} questions scored low.`,
  });
}

module.exports = { scheduleNightlyEval };