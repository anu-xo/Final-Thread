import mongoose from 'mongoose';
import CommunityMember from '../models/CommunityMember.js';

const communitySchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true, maxlength: 100 },
    slug:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, maxlength: 500 },
    icon:        { type: String, default: null },   // Cloudinary URL (Day 7)
    banner:      { type: String, default: null },   // Cloudinary URL (Day 7)
    members:     { type: Number, default: 0 },
    mods:        [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    rules:       [{ title: String, body: String }],
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    aiEnabled:   { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Text index for Atlas Search (Day 7), regular index for now
communitySchema.index({ slug: 1 }, { unique: true });
communitySchema.index({ members: -1 });

export default mongoose.model('Community', communitySchema);