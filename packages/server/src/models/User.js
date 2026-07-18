import mongoose from 'mongoose';
import CommunityMember from '../models/CommunityMember.js';

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ['user', 'moderator', 'admin'],
      default: 'user',
    },
    karma: {
      type: Number,
      default: 0,
    },
    refreshTokens: {
      type: [String],
      default: [],
      select: false,
    },
    isBanned: {
      type: Boolean,
      default: false,
    },
    bannedAt: {
      type: Date,
    },
    banReason: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ username: 'text', email: 'text' });

const User = mongoose.model('User', userSchema);

export default User;
