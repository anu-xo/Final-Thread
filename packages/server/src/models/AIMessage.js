import mongoose from 'mongoose';

const aiMessageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'AIConversation', required: true },
  role:         { type: String, enum: ['user', 'assistant'], required: true },
  content:      { type: String, required: true },
  sources:      [{ postId: mongoose.Schema.Types.ObjectId, title: String }],
  tokensUsed:   { type: Number, default: 0 },
  rating:       { type: Number, enum: [1, -1, null], default: null },
}, { timestamps: true });

export default mongoose.model('AIMessage', aiMessageSchema);