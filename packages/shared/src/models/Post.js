import mongoose from 'mongoose';

const postSchema = new mongoose.Schema({
  title:        { type: String, required: true, maxlength: 300 },
  body:         { type: String },
  type:         { type: String, enum: ['text', 'link', 'image'], default: 'text' },
  url:          { type: String },       // for link posts
  media:        [{ type: String }],     // CDN URLs for image posts
  author:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  community:    { type: mongoose.Schema.Types.ObjectId, ref: 'Community', required: true },
  score:        { type: Number, default: 0 },
  hotScore:     { type: Number, default: 0 },
  commentCount: { type: Number, default: 0 },
  isRemoved:    { type: Boolean, default: false },
  flair:        { type: String },
}, { timestamps: true });

export default mongoose.model('Post', postSchema);