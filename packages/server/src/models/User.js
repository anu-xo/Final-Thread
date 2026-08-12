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
      // System accounts (Neo) have no password and must never log in — the
      // null hash makes bcrypt.compare fail even without the explicit guard.
      required: function () {
        return !this.isSystemAccount;
      },
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
    // Seeded system accounts (e.g. the "neo-ai" author) — no password, and the
    // auth routes reject any login attempt against them.
    isSystemAccount: {
      type: Boolean,
      default: false,
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
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system',
    },
    notifPrefs: {
      digest: { type: Boolean, default: true },
      replies: { type: Boolean, default: true },
      mentions: { type: Boolean, default: true },
      // Active layer (dedup notification + stale nudge). Per-user opt-out so a
      // single active user can't be spammed by Neo's proactive nudges.
      neoActiveNudges: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ username: 'text', email: 'text' });

const User = mongoose.model('User', userSchema);

export default User;
