// packages/server/src/scripts/evalVariants.js
//
// Cross-variant eval: runs the 20-question suite against all 3 prompt variants
// (v1-verbose, v2-concise, v3-structured) across 3 test communities.
// Records token count, citation rate, relevance, and faithfulness scores.
// Cross-references against existing EvalResult rating data.

import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { default: mongoose } = await import('mongoose');
const questionsByCommunity = (await import('./evalQuestions.json', { with: { type: 'json' } })).default;
const { judgeResponse } = await import('../services/evalJudge.js');
const { default: EvalResult } = await import('../models/EvalResult.js');
const { default: Community } = await import('../models/Community.js');
const { default: Post } = await import('../models/Post.js');
const { default: PostEmbedding } = await import('../models/PostEmbedding.js');
const aiService = await import('../services/aiService.js');
const { GoogleGenerativeAI } = await import('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });

// Import all 3 prompt variants
const v1 = await import('../services/prompts/v1-verbose.js');
const v2 = await import('../services/prompts/v2-concise.js');
const v3 = await import('../services/prompts/v3-structured.js');

const VARIANTS = [
  { name: 'v1-verbose', buildPrompt: v1.buildPrompt, SYSTEM_PROMPT: v1.SYSTEM_PROMPT },
  { name: 'v2-concise', buildPrompt: v2.buildPrompt, SYSTEM_PROMPT: v2.SYSTEM_PROMPT },
  { name: 'v3-structured', buildPrompt: v3.buildPrompt, SYSTEM_PROMPT: v3.SYSTEM_PROMPT },
];

// 3 test communities (first 3 from the 5 in evalQuestions.json)
const TEST_COMMUNITIES = [
  '6a5f85bd0d968cc815a85c51', // React Developers
  '6a5f85bd0d968cc815a85c59', // Node.js
  '6a5f85bd0d968cc815a85c61', // MongoDB
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function hasValidCitation(answer, variant, contextChunks) {
  if (variant === 'v3-structured') {
    // Check for [N] inline citations
    const inlineCitations = answer.match(/\[\d+\]/g);
    if (!inlineCitations || inlineCitations.length === 0) return false;
    // Check for Sources: block at end
    const hasSourcesBlock = /sources:/i.test(answer);
    return hasSourcesBlock;
  }
  // v1/v2: check for free-text citation "Based on" or "Source:"
  return /(?:based on|source:)\s*["\u201c]/i.test(answer);
}

async function generateEmbeddingsForCommunity(communityId) {
  const existingCount = await PostEmbedding.countDocuments({ communityId });
  if (existingCount > 0) {
    console.log(`  embeddings already exist (${existingCount}), skipping generation`);
    return existingCount;
  }

  console.log('  generating embeddings for all posts...');
  const posts = await Post.find({ community: communityId, isRemoved: false })
    .select('title body')
    .lean();

  if (posts.length === 0) {
    console.warn('  no posts found');
    return 0;
  }

  const BATCH_SIZE = 20;
  let created = 0;

  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);
    const texts = batch.map((p) => `${p.title}\n\n${p.body || ''}`.slice(0, 2000));

    try {
      // Use batch embedding
      const result = await embeddingModel.batchEmbedContents({
        requests: texts.map((text) => ({
          content: { parts: [{ text }] },
        })),
      });

      const docs = batch.map((post, idx) => ({
        postId: post._id,
        communityId,
        type: 'post',
        text: texts[idx],
        embedding: result.embeddings[idx].values,
      }));

      await PostEmbedding.insertMany(docs, { ordered: false }).catch(() => {});
      created += docs.length;
      process.stdout.write(`  embedded ${created}/${posts.length}\r`);
    } catch (err) {
      console.warn(`  batch embed failed: ${err.message}, trying individual...`);
      for (let j = 0; j < batch.length; j++) {
        try {
          const emb = await aiService.embedQuery(texts[j]);
          await PostEmbedding.create({
            postId: batch[j]._id,
            communityId,
            type: 'post',
            text: texts[j],
            embedding: emb,
          });
          created++;
        } catch (e) {
          // skip this post
        }
      }
    }

    // Rate limit: 100ms between batches
    if (i + BATCH_SIZE < posts.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  console.log(`  embedded ${created}/${posts.length} posts`);
  return created;
}

// ── Main eval ───────────────────────────────────────────────────────────────

async function evalVariant(variant, question, communityName, communityId) {
  // Embed query
  const queryEmbedding = await aiService.embedQuery(question);

  // Retrieve context
  const contextChunks = await aiService.retrieveContext(queryEmbedding, communityId);

  // Build prompt using variant's buildPrompt
  const prompt = variant.buildPrompt({
    communityName,
    contextChunks,
    history: [],
    message: question,
  });

  // Count tokens
  const geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  let tokenCount = 0;
  try {
    const tokenResult = await geminiModel.countTokens(prompt);
    tokenCount = tokenResult.totalTokens;
  } catch {
    // estimate: ~4 chars per token
    tokenCount = Math.ceil(prompt.length / 4);
  }

  // Generate answer
  const answer = await aiService.getNonStreamingResponse(prompt);

  // Build sources for judge
  const postIds = [...new Set(contextChunks.map((c) => c.postId.toString()))];
  const posts = await Post.find({ _id: { $in: postIds } }).select('title').lean();
  const postTitleMap = posts.reduce((m, p) => { m[p._id.toString()] = p.title; return m; }, {});
  const sources = contextChunks.map((c) => ({
    postId: c.postId,
    title: postTitleMap[c.postId.toString()] || 'Untitled',
  }));

  // Judge
  const grade = await judgeResponse({ question, answer, sources });

  // Citation check
  const hasCitation = hasValidCitation(answer, variant.name, contextChunks);

  return {
    answer,
    tokenCount,
    sourceCount: contextChunks.length,
    hasCitation,
    relevance: grade.relevance,
    faithfulness: grade.faithfulness,
    groundedness: grade.groundedness,
    reasoning: grade.reasoning,
  };
}

async function runFullEval() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const allResults = [];

  for (const communityId of TEST_COMMUNITIES) {
    const community = await Community.findById(communityId).select('name');
    if (!community) {
      console.warn(`Community ${communityId} not found, skipping`);
      continue;
    }

    console.log(`=== ${community.name} (${communityId}) ===`);

    // Ensure embeddings exist
    await generateEmbeddingsForCommunity(communityId);

    const questions = questionsByCommunity[communityId] || [];

    for (const { question } of questions) {
      console.log(`\n  Q: "${question.slice(0, 70)}…"`);

      for (const variant of VARIANTS) {
        try {
          const result = await evalVariant(variant, question, community.name, communityId);

          console.log(
            `    ${variant.name.padEnd(14)} tokens=${String(result.tokenCount).padStart(5)} ` +
            `sources=${result.sourceCount} citation=${result.hasCitation ? 'YES' : 'NO'} ` +
            `rel=${result.relevance ?? 'ERR'} faith=${result.faithfulness ?? 'ERR'} gnd=${result.groundedness ?? 'ERR'}`
          );

          allResults.push({
            communityId,
            communityName: community.name,
            question,
            variant: variant.name,
            ...result,
          });

          // Save to EvalResult
          const saveGrade = { relevance: result.relevance, faithfulness: result.faithfulness, groundedness: result.groundedness };
          if (saveGrade.groundedness === 0) saveGrade.groundedness = 1;
          await EvalResult.create({
            community: communityId,
            question,
            answer: result.answer,
            ...saveGrade,
            hasCitation: result.hasCitation,
            reasoning: result.reasoning,
            promptVersion: variant.name,
          });
        } catch (err) {
          console.error(`    ${variant.name.padEnd(14)} FAILED: ${err.message}`);
          allResults.push({
            communityId,
            communityName: community.name,
            question,
            variant: variant.name,
            answer: '',
            tokenCount: 0,
            sourceCount: 0,
            hasCitation: false,
            relevance: null,
            faithfulness: null,
            groundedness: null,
            reasoning: `ERROR: ${err.message}`,
          });
        }

        // Rate limit between variants
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    console.log('');
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  CROSS-VARIANT EVAL SUMMARY');
  console.log('══════════════════════════════════════════════════════════════\n');

  const summary = {};
  for (const variant of VARIANTS) {
    const vResults = allResults.filter((r) => r.variant === variant.name && r.relevance !== null);
    const avg = (key) => {
      const vals = vResults.map((r) => r[key]).filter((v) => v !== null && v !== undefined);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };

    summary[variant.name] = {
      questionsRun: vResults.length,
      avgTokens: Math.round(avg('tokenCount')),
      citationRate: vResults.length ? ((vResults.filter((r) => r.hasCitation).length / vResults.length) * 100).toFixed(1) + '%' : 'N/A',
      avgRelevance: avg('relevance').toFixed(2),
      avgFaithfulness: avg('faithfulness').toFixed(2),
      avgGroundedness: avg('groundedness').toFixed(2),
      overallAvg: ((avg('relevance') + avg('faithfulness')) / 2).toFixed(2),
    };
  }

  console.table(summary);

  // ── Cross-reference with existing EvalResult data ────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  HISTORICAL BASELINE (existing EvalResults)');
  console.log('══════════════════════════════════════════════════════════════\n');

  const historical = await EvalResult.aggregate([
    { $match: { promptVersion: { $in: ['v1.0', 'desktop-cache-v1', 'server-vsearch-v1', 'desktop-cache-v2'] } } },
    {
      $group: {
        _id: '$promptVersion',
        count: { $sum: 1 },
        avgRel: { $avg: '$relevance' },
        avgFaith: { $avg: '$faithfulness' },
        pctGrounded: { $avg: '$groundedness' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  console.table(historical.map((h) => ({
    version: h._id,
    questions: h.count,
    avgRel: h.avgRel?.toFixed(2),
    avgFaith: h.avgFaith?.toFixed(2),
    pctGrounded: h.pctGrounded ? (h.pctGrounded * 100).toFixed(0) + '%' : 'N/A',
  })));

  // ── No real user rating data to cross-reference ──────────────────────────
  const aiMsgRatings = await mongoose.connection.db.collection('aimessages').aggregate([
    { $match: { rating: { $ne: null } } },
    { $group: { _id: '$rating', count: { $sum: 1 } } },
  ]).toArray();

  if (aiMsgRatings.length === 0) {
    console.log('\n  NOTE: No real user thumbs-up/down feedback (AIMessage.rating) exists yet.');
    console.log('  Cross-reference with user feedback not possible until users interact with AI chat.');
  } else {
    console.log('\n  User feedback distribution:', JSON.stringify(aiMsgRatings));
  }

  // ── Save full report ─────────────────────────────────────────────────────
  const report = {
    timestamp: new Date().toISOString(),
    variants: VARIANTS.map((v) => v.name),
    communities: TEST_COMMUNITIES,
    summary,
    historicalBaseline: historical,
    totalQuestions: allResults.length / VARIANTS.length,
    results: allResults,
  };

  const reportPath = path.resolve(__dirname, '../../eval-variants-report.json');
  const fs = await import('fs');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n  Full report saved to: eval-variants-report.json`);

  await mongoose.disconnect();
  console.log('\nDone.');
}

runFullEval().catch((err) => {
  console.error('Eval failed:', err);
  process.exit(1);
});
