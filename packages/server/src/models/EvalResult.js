// packages/server/src/models/EvalResult.js
import mongoose from 'mongoose';

const evalResultSchema = new mongoose.Schema(
  {
    community: { type: mongoose.Schema.Types.ObjectId, ref: 'Community', required: true, index: true },
    question: { type: String, required: true },
    answer: { type: String, required: true },
    relevance: { type: Number, min: 1, max: 5, default: null },
    faithfulness: { type: Number, min: 1, max: 5, default: null },
    groundedness: { type: Number, enum: [0, 1], default: null },
    reasoning: { type: String },
    promptVersion: { type: String, default: 'v1.0' }, // ties results to your Day 6 system-prompt version tag
  },
  { timestamps: true }
);

export default mongoose.model('EvalResult', evalResultSchema);