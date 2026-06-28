import mongoose from 'mongoose';

const communitySchema = new mongoose.Schema({
  slug:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  name:        { type: String, required: true },
  description: { type: String, maxlength: 500 },
  members:     { type: Number, default: 0 },
  mods:        [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  rules:       [{ title: String, body: String }],
  aiEnabled:   { type: Boolean, default: true },
  banner:      { type: String },
  icon:        { type: String },
}, { timestamps: true });

export default mongoose.model('Community', communitySchema);