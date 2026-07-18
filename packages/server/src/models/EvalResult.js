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
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('EvalResult', evalResultSchema);