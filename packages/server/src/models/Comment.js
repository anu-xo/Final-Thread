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

export default mongoose.model('Comment', commentSchema);
