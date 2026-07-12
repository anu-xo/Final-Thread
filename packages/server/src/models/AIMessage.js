import mongoose from 'mongoose';

const sourceSchema = new mongoose.Schema(
  {
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    title: { type: String, required: true },
  },
  { _id: false }
);

const aiMessageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AIConversation',
      required: true,
      index: true,
    },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    sources: { type: [sourceSchema], default: [] },
    tokensUsed: { type: Number, default: 0 },
    rating: { type: Number, enum: [1, -1, null], default: null },
  },
  { timestamps: true }
);

// Compound index to speed up retrieving message history chronologically for a specific conversation
aiMessageSchema.index({ conversation: 1, createdAt: 1 });

const AIMessage = mongoose.model('AIMessage', aiMessageSchema);

export default AIMessage;