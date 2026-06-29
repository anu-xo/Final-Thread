import mongoose from 'mongoose';
import CommunityMember from '../models/CommunityMember.js';

const communityMemberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    community: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Community',
      required: true,
    },
    role: {
      type: String,
      enum: ['member', 'mod', 'banned'],
      default: 'member',
    },
  },
  { timestamps: true }
);

// Compound index — one membership record per user per community
communityMemberSchema.index({ user: 1, community: 1 }, { unique: true });

export default mongoose.model('CommunityMember', communityMemberSchema);