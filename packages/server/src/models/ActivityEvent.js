import mongoose from 'mongoose';

const activityEventSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    event: {
      type: String,
      required: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ['desktop', 'web'],
      default: 'web',
      index: true,
    },
    appVersion: {
      type: String,
      default: null,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

activityEventSchema.index({ event: 1, platform: 1, createdAt: -1 });
activityEventSchema.index({ platform: 1, appVersion: 1, createdAt: -1 });

export default mongoose.model('ActivityEvent', activityEventSchema);
