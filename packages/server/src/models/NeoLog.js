import mongoose from 'mongoose';

const neoLogSchema = new mongoose.Schema({
  triggerType: {
    type: String,
    enum: ['active_dedup', 'active_stale', 'autonomous_mention', 'autonomous_summary', 'passive_chat', 'digest'],
    required: true,
  },
  layerUsed: {
    type: String,
    enum: ['vector_search', 'text_search', 'aggregation', 'none'],
    required: true,
  },
  sourcePostIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
  communityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Community' },
  targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  query: { type: String, default: null },
  tokensUsed: { type: Number, default: 0 },
  latencyMs: { type: Number, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

// Fast existence check: "has this post already been nudged for trigger X"
neoLogSchema.index({ triggerType: 1, sourcePostIds: 1 });

export default mongoose.model('NeoLog', neoLogSchema);
