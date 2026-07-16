import mongoose from 'mongoose';
import { buildEmbeddingPayload } from '../utils/embeddingPayloads.js';

const commentSchema = new mongoose.Schema(
  {
    body: { type: String, required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
    depth: { type: Number, default: 0, max: 5 },
    score: { type: Number, default: 0 },
    isRemoved: { type: Boolean, default: false },
  },
  { timestamps: true }
);

commentSchema.index({ post: 1, parent: 1, score: -1 });
commentSchema.index({ post: 1, isRemoved: 1, score: -1, createdAt: 1 });

commentSchema.post('save', async function (doc) {
  try {
    const { getEmbeddingQueue } = await import('../jobs/embeddingQueue.js');
    const { default: Post } = await import('./Post.js');

    const queue = getEmbeddingQueue();
    const post = await Post.findById(doc.post).select('community title').lean();

    if (!post) {
      return;
    }

    const payload = buildEmbeddingPayload({
      type: 'comment',
      document: {
        ...doc.toObject(),
        post: doc.post,
        postTitle: post.title,
      },
      communityId: post.community,
    });

    await queue.add(payload, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    console.log(`📨 Embedding job queued for comment: ${doc._id}`);
  } catch (err) {
    console.error('Failed to queue comment embedding job:', err.message);
  }
});

// --- Day 12: notification trigger ---
commentSchema.pre('save', function (next) {
  this.wasNew = this.isNew;
  next();
});

commentSchema.post('save', async function (doc, next) {
  try {
    if (!doc.wasNew) return next();

    const { default: Notification } = await import('./Notification.js');
    const { default: User } = await import('./User.js');
    const { getIO } = await import('../socket.js');

    const notifications = [];

    // Case 1: reply to a parent comment
    if (doc.parent) {
      const parentComment = await mongoose
        .model('Comment')
        .findById(doc.parent)
        .select('author');
      if (parentComment && String(parentComment.author) !== String(doc.author)) {
        notifications.push({
          user: parentComment.author,
          type: 'reply',
          actor: doc.author,
          target: doc._id,
          targetType: 'Comment',
        });
      }
    }

    // Case 2: @mention in body — simple regex extraction, then resolve usernames
    const mentionMatches = [...doc.body.matchAll(/@(\w+)/g)].map((m) => m[1]);
    if (mentionMatches.length) {
      const mentionedUsers = await User.find({
        username: { $in: mentionMatches },
      }).select('_id');
      for (const u of mentionedUsers) {
        if (String(u._id) !== String(doc.author)) {
          notifications.push({
            user: u._id,
            type: 'mention',
            actor: doc.author,
            target: doc._id,
            targetType: 'Comment',
          });
        }
      }
    }

    if (notifications.length === 0) return next();

    const created = await Notification.insertMany(notifications);

    // Push to each recipient's personal socket room
    const io = getIO();
    for (const n of created) {
      io.to('user:' + n.user).emit('notification:new', {
        _id: n._id,
        type: n.type,
        actor: doc.author,
        target: n.target,
        targetType: n.targetType,
        createdAt: n.createdAt,
      });
    }

    next();
  } catch (err) {
    console.error('[notification hook] failed:', err.message);
    next();
  }
});

export default mongoose.model('Comment', commentSchema);
