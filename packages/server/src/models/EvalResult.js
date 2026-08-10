// packages/server/src/models/EvalResult.js
import mongoose from 'mongoose';

const evalResultSchema = new mongoose.Schema(
  {
    community: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Community',
      required: true,
      index: true,
    },

    // Alias for compatibility with newer code
    communityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Community',
    },

    question: {
      type: String,
      required: true,
    },

    answer: {
      type: String,
      required: true,
    },

    relevance: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },

    faithfulness: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },

    groundedness: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },

    hasCitation: {
      type: Boolean,
      default: false,
    },

    reasoning: {
      type: String,
    },

    promptVersion: {
      type: String,
      default: 'v1.0',
    },

    // Which Neo layer produced this result, so scores from the new layers don't
    // get silently averaged in with direct-chat scores.
    // ambient_pulse is deliberately excluded — it's deterministic term-frequency,
    // not an LLM call, there's nothing to quality-grade.
    triggerType: {
      type: String,
      enum: ['passive_chat', 'autonomous_mention', 'autonomous_summary', 'digest_highlight'],
      default: 'passive_chat', // existing eval rows without this field default correctly
      required: true,
    },

    // ── Per-run tracking fields ────────────────────────────────────────────
    // Groups all EvalResults created during a single eval execution.
    // Format: `baseline-2026-07-26T12:00:00Z` or `nightly-2026-08-15T02:00:00Z`
    runId: {
      type: String,
      index: true,
    },

    // Which retrieval backend produced this result: 'server-vsearch' | 'desktop-cache' | 'cron'
    mode: {
      type: String,
      enum: ['server-vsearch', 'desktop-cache', 'cron', 'baseline', 'rag', 'variant', null],
      default: null,
    },

    // Latency breakdown (ms) — populated by eval runner, null when unknown
    embedMs: {
      type: Number,
      default: null,
    },
    retrievalMs: {
      type: Number,
      default: null,
    },
    llmMs: {
      type: Number,
      default: null,
    },
    judgeMs: {
      type: Number,
      default: null,
    },
    totalMs: {
      type: Number,
      default: null,
    },

    // Whether the retrieval returned any context chunks
    cacheHit: {
      type: Boolean,
      default: null,
    },

    // Number of source chunks returned by retrieval
    sourcesReturned: {
      type: Number,
      default: null,
    },

    // Free-text tag for the eval run label, e.g. "pre-launch-baseline", "nightly"
    evalLabel: {
      type: String,
      index: true,
    },

    // Whether this question is an edge case (prompt injection, off-topic, etc.)
    isEdgeCase: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast baseline vs nightly comparison queries
evalResultSchema.index({ evalLabel: 1, community: 1, promptVersion: 1 });
evalResultSchema.index({ runId: 1, evalLabel: 1 });

export default mongoose.model('EvalResult', evalResultSchema);