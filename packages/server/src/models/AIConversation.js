// packages/server/src/models/AIConversation.js
import mongoose from 'mongoose';

// `community` is optional: community-scoped chats set it to the community _id,
// while the standalone site-wide AI chat (no community context) stores `null`.
const aiConversationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    community: { type: mongoose.Schema.Types.ObjectId, ref: 'Community', default: null },
  },
  { timestamps: true }
);

// Speeds up checking and listing a user's chronological conversations in a
// specific community (or, with community: null, their standalone global chats).
aiConversationSchema.index({ user: 1, community: 1, updatedAt: -1 });

// Standalone community index for admin analytics lookups
aiConversationSchema.index({ community: 1 });

const AIConversation = mongoose.model('AIConversation', aiConversationSchema);

export default AIConversation;