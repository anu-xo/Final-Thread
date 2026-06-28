import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  body:      { type: String, required: true },
  author:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  post:      { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  parent:    { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
  depth:     { type: Number, default: 0, max: 5 },
  score:     { type: Number, default: 0 },
  isRemoved: { type: Boolean, default: false },
}, { timestamps: true });

commentSchema.index({ post: 1, parent: 1, score: -1 });

export default mongoose.model('Comment', commentSchema);