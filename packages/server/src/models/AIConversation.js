// packages/server/src/models/AIConversation.js
import mongoose from 'mongoose';

const aiConversationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    community: { type: mongoose.Schema.Types.ObjectId, ref: 'Community', required: true },
  },
  { timestamps: true }
);

// Speeds up checking and listing a user's chronological conversations in a specific community
aiConversationSchema.index({ user: 1, community: 1, updatedAt: -1 });

const AIConversation = mongoose.model('AIConversation', aiConversationSchema);

export default AIConversation;