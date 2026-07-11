import mongoose from 'mongoose';
const { Schema } = mongoose;

/**
 * ModerationLog
 *
 * Unified audit trail for two distinct moderation events:
 *  1. source: 'ai'  — automated Gemini content classification on post/comment creation
 *  2. source: 'mod' — manual mod action (approve/remove/ban) taken from the Mod queue
 *
 * Keeping both in one collection lets the Day 13 admin dashboard query a single
 * timeline of everything that happened to a piece of content or a user.
 */
const moderationLogSchema = new Schema(
  {
    source: {
      type: String,
      enum: ['ai', 'mod'],
      required: true,
      index: true,
    },

    // --- Common fields ---
    targetType: {
      type: String,
      enum: ['post', 'comment'],
      required: true,
    },
    target: {
      type: Schema.Types.ObjectId,
      required: false, // optional: AI classification may run pre-save, before target has an _id
      refPath: 'targetType',
    },
    community: {
      type: Schema.Types.ObjectId,
      ref: 'Community',
      required: true,
      index: true,
    },

    // --- AI classification fields (source: 'ai') ---
    label: {
      type: String,
      enum: ['SAFE', 'SPAM', 'HATE', 'NSFW'],
      required: function () {
        return this.source === 'ai';
      },
    },
    content: {
      type: String,
      maxlength: 500,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: function () {
        return this.source === 'ai';
      },
    },

    // --- Mod action fields (source: 'mod') ---
    moderator: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: function () {
        return this.source === 'mod';
      },
    },
    action: {
      type: String,
      enum: ['approve', 'remove', 'ban'],
      required: function () {
        return this.source === 'mod';
      },
    },
    reason: {
      type: String,
      required: false,
    },
    reportId: {
      type: Schema.Types.ObjectId,
      ref: 'Report',
      required: false,
    },
  },
  { timestamps: true }
);

moderationLogSchema.index({ community: 1, createdAt: -1 });

export default mongoose.model('ModerationLog', moderationLogSchema);