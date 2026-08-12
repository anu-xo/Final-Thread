// packages/server/src/jobs/evalNeoLayers.js
//
// Nightly eval suites for the three neo autonomous layers (Day 24 / Day 25).
// Each suite drives the SAME production path the real worker uses — no
// parallel eval-only code path — so results reflect production behavior:
//   - mention:      retrieveContext + buildPromptWithinBudget + generateNonStreamingResponse
//   - summary:      buildThreadSummaryPrompt + generateNonStreamingResponse
//   - digest:       buildDigestHighlightPrompt + generateNonStreamingResponse
// Every sample is graded through the shared type-aware judgeOutput and
// recorded in EvalResult with its triggerType so scores never mix.

import EvalResult from '../models/EvalResult.js';
import Post from '../models/Post.js';
import Comment from '../models/Comment.js';
import Community from '../models/Community.js';
import {
  embedQuery,
  retrieveContext,
  buildPromptWithinBudget,
  buildSystemPrompt,
  buildThreadSummaryPrompt,
  buildDigestHighlightPrompt,
  generateNonStreamingResponse,
  THREAD_SUMMARY_PROMPT_VERSION,
  DIGEST_HIGHLIGHT_PROMPT_VERSION,
} from '../services/aiService.js';
import { NEO_DIGEST_HIGHLIGHT_TOP_N } from '../config/neoConfig.js';
import {
  resolveMentionFixtures,
  resolveSummaryFixtures,
  resolveDigestFixtures,
} from '../scripts/evalFixtures/index.js';
import { judgeOutput } from './evalCron.js';

const MENTION_PROMPT_VERSION = 'prompt-v3.0-2026-07-25';
const MAX_SUMMARY_COMMENTS = 30;
const DIGEST_WINDOW_DAYS = 7;
const RATE_LIMIT_MS = 500;

const pause = () => new Promise((r) => setTimeout(r, RATE_LIMIT_MS));

async function persistEvalRow({
  type,
  community,
  question,
  answer,
  grade,
  promptVersion,
  runId,
  evalLabel,
  hasCitation,
  sourcesReturned,
  cacheHit,
  embedMs,
  retrievalMs,
  llmMs,
  judgeMs,
}) {
  const totalMs = (embedMs ?? 0) + (retrievalMs ?? 0) + (llmMs ?? 0) + (judgeMs ?? 0);

  const doc = await EvalResult.create({
    community,
    question,
    answer,
    ...grade,
    hasCitation,
    promptVersion,
    runId,
    mode: 'cron',
    evalLabel,
    triggerType: type,
    embedMs,
    retrievalMs,
    llmMs,
    judgeMs,
    totalMs,
    cacheHit,
    sourcesReturned,
  });

  return { doc, grade, embedMs, retrievalMs, llmMs, judgeMs, totalMs, sourcesReturned, cacheHit };
}

// ── Autonomous mention ──────────────────────────────────────────────────────

export async function runMentionSuite({ runId, evalLabel }) {
  const fixtures = await resolveMentionFixtures();
  const results = [];

  for (const fx of fixtures) {
    try {
      const community = await Community.findById(fx.communityId).select('name');
      const communityName = community?.name || 'thread';

      const embedStart = Date.now();
      const queryEmbedding = await embedQuery(fx.question);
      const embedMs = Date.now() - embedStart;

      const retrievalStart = Date.now();
      const contextChunks = await retrieveContext({
        queryEmbedding,
        communityId: fx.communityId,
        postId: fx.postId,
      });
      const retrievalMs = Date.now() - retrievalStart;

      const { prompt } = await buildPromptWithinBudget({
        systemPrompt: buildSystemPrompt(communityName),
        contextChunks: contextChunks.map((c) => c.text),
        history: [],
        userMessage: fx.question,
      });

      const llmStart = Date.now();
      const responseText = await generateNonStreamingResponse(prompt);
      const llmMs = Date.now() - llmStart;

      const judgeContext = [
        `Triggering comment: ${fx.triggerCommentBody}`,
        'Retrieved context:',
        ...(contextChunks.length
          ? contextChunks.map((c) => c.text)
          : ['(no context retrieved)']),
      ].join('\n\n');

      const judgeStart = Date.now();
      const grade = await judgeOutput('autonomous_mention', responseText, judgeContext);
      const judgeMs = Date.now() - judgeStart;

      const result = await persistEvalRow({
        type: 'autonomous_mention',
        community: fx.communityId,
        question: fx.question,
        answer: responseText,
        grade,
        promptVersion: MENTION_PROMPT_VERSION,
        runId,
        evalLabel,
        hasCitation: contextChunks.length > 0,
        sourcesReturned: contextChunks.length,
        cacheHit: contextChunks.length > 0,
        embedMs,
        retrievalMs,
        llmMs,
        judgeMs,
      });

      results.push({ ...result, fixture: fx });
      console.log(
        `  [mention] "${fx.question.slice(0, 48)}…" → rel=${grade.relevance} gnd=${grade.groundedness} faith=${grade.faithfulness} src=${contextChunks.length} ${result.totalMs}ms`
      );
    } catch (err) {
      console.error(`  [mention] SAMPLE FAILED: ${err.message}`);
    }
    await pause();
  }

  return { type: 'autonomous_mention', label: 'Autonomous Mention', results };
}

// ── Autonomous summary ──────────────────────────────────────────────────────

export async function runSummarySuite({ runId, evalLabel }) {
  const fixtures = await resolveSummaryFixtures();
  const results = [];

  for (const fx of fixtures) {
    try {
      const post = await Post.findById(fx.postId);
      if (!post) {
        console.warn(`  [summary] post ${fx.postId} not found — skipping sample`);
        continue;
      }

      const community = await Community.findById(fx.communityId).select('name');
      const communityName = community?.name || 'thread';

      const topComments = await Comment.find({ post: post._id, isRemoved: false })
        .sort({ score: -1, createdAt: 1 })
        .limit(MAX_SUMMARY_COMMENTS)
        .select('body author score depth')
        .lean();

      const prompt = buildThreadSummaryPrompt({ communityName, post, topComments });

      const llmStart = Date.now();
      const responseText = await generateNonStreamingResponse(prompt);
      const llmMs = Date.now() - llmStart;

      const judgeContext = [
        `Post title: ${post.title}`,
        post.body ? `Post body: ${post.body}` : null,
        'Comments:',
        ...(topComments.length
          ? topComments.map((c) => `(score ${c.score}) ${c.body}`)
          : ['(no comments)']),
      ]
        .filter(Boolean)
        .join('\n\n');

      const judgeStart = Date.now();
      const grade = await judgeOutput('autonomous_summary', responseText, judgeContext);
      const judgeMs = Date.now() - judgeStart;

      const result = await persistEvalRow({
        type: 'autonomous_summary',
        community: fx.communityId,
        question: `Thread summary: ${post.title}`,
        answer: responseText,
        grade,
        promptVersion: THREAD_SUMMARY_PROMPT_VERSION,
        runId,
        evalLabel,
        hasCitation: false,
        sourcesReturned: topComments.length,
        cacheHit: null,
        embedMs: null,
        retrievalMs: null,
        llmMs,
        judgeMs,
      });

      results.push({ ...result, fixture: fx });
      console.log(
        `  [summary] "${post.title.slice(0, 48)}…" (${topComments.length} comments) → rel=${grade.relevance} gnd=${grade.groundedness} faith=${grade.faithfulness} ${result.totalMs}ms`
      );
    } catch (err) {
      console.error(`  [summary] SAMPLE FAILED: ${err.message}`);
    }
    await pause();
  }

  return { type: 'autonomous_summary', label: 'Autonomous Summary', results };
}

// ── Digest highlight ────────────────────────────────────────────────────────

export async function runDigestSuite({ runId, evalLabel }) {
  const fixtures = await resolveDigestFixtures();
  const sevenDaysAgo = new Date(Date.now() - DIGEST_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const results = [];
  const note =
    'digest_highlight is time-varying by design: samples grade against the community\'s real top posts for the current week, so scores naturally fluctuate with weekly post volume.';

  for (const fx of fixtures) {
    try {
      const community = await Community.findById(fx.communityId).select('name slug');
      if (!community) {
        console.warn(`  [digest] community ${fx.communityId} not found — skipping sample`);
        continue;
      }

      const topPosts = await Post.find({
        community: community._id,
        createdAt: { $gte: sevenDaysAgo },
        isRemoved: false,
      })
        .sort({ score: -1 })
        .limit(NEO_DIGEST_HIGHLIGHT_TOP_N)
        .select('title body score');

      if (topPosts.length === 0) {
        console.warn(`  [digest] ${community.name}: no posts this week — skipping sample`);
        continue;
      }

      const prompt = buildDigestHighlightPrompt({ communityName: community.name, topPosts });

      const llmStart = Date.now();
      const highlightText = await generateNonStreamingResponse(prompt);
      const llmMs = Date.now() - llmStart;

      const judgeContext = [
        `Community: r/${community.slug}`,
        'This week\'s top posts:',
        ...topPosts.map(
          (p) => `(score ${p.score}) "${p.title}"${p.body ? ` — ${p.body}` : ''}`
        ),
      ].join('\n\n');

      const judgeStart = Date.now();
      const grade = await judgeOutput('digest_highlight', highlightText, judgeContext);
      const judgeMs = Date.now() - judgeStart;

      const result = await persistEvalRow({
        type: 'digest_highlight',
        community: community._id,
        question: `Weekly digest highlight: ${community.name}`,
        answer: highlightText,
        grade,
        promptVersion: DIGEST_HIGHLIGHT_PROMPT_VERSION,
        runId,
        evalLabel,
        hasCitation: false,
        sourcesReturned: topPosts.length,
        cacheHit: null,
        embedMs: null,
        retrievalMs: null,
        llmMs,
        judgeMs,
      });

      results.push({ ...result, fixture: fx });
      console.log(
        `  [digest] r/${community.slug} (${topPosts.length} posts this week) → rel=${grade.relevance} gnd=${grade.groundedness} faith=${grade.faithfulness} ${result.totalMs}ms`
      );
    } catch (err) {
      console.error(`  [digest] SAMPLE FAILED: ${err.message}`);
    }
    await pause();
  }

  return { type: 'digest_highlight', label: 'Digest Highlight', note, results };
}
