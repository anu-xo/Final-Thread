import CommunityMember from '../models/CommunityMember.js';
import mongoose from 'mongoose';

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
    // Why select: false?
    // passwordHash is never returned in queries by default.
    // You must explicitly opt-in with .select('+passwordHash') — as done in /login.
    // This prevents accidentally leaking the hash in any other route.
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
    // Stores active refresh tokens for rotation & revocation.
    // On logout or refresh, old tokens are $pull-ed and blacklisted in Redis.
    refreshTokens: {
      type: [String],
      default: [],
      select: false,
    },
  },
  {
    timestamps: true, // adds createdAt, updatedAt automatically
  }
);

const User = mongoose.model('User', userSchema);

export default User;