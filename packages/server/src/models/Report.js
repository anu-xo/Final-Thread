import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Report
 *
 * Created when a user reports a post or comment. Sits in 'pending' status
 * until a mod actions it via POST /mod/action, at which point mod.js updates
 * this document's status and writes a corresponding ModerationLog entry.
 */
const reportSchema = new Schema(
  {
    reporter: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    target: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: 'targetType',
    },
    targetType: {
      type: String,
      enum: ['post', 'comment'],
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    detail: {
      type: String,
      required: false,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'removed', 'dismissed'],
      default: 'pending',
      index: true,
    },
    community: {
      type: Schema.Types.ObjectId,
      ref: 'Community',
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// Supports the Mod queue's GET /mod/queue?communityId=&cursor= query:
// filter by {status: 'pending', community: {$in: [...]}}, sort by _id desc
reportSchema.index({ community: 1, status: 1, _id: -1 });

const Report = mongoose.model('Report', reportSchema);

export default Report;