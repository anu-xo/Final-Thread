import mongoose from 'mongoose';
import CommunityMember from '../models/CommunityMember.js';

const PostSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    body: {
      type: String,
      default: '',
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    community: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Community',
      required: true,
    },
    type: {
      type: String,
      enum: ['text', 'link', 'image'],
      default: 'text',
    },
    url: {
      type: String,
      default: null,
    },
    upvotes: { type: Number, default: 0 },
    downvotes: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false },
    isPinned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

PostSchema.post('save', async function (doc) {
  try {
    const { getEmbeddingQueue } = await import('../jobs/embeddingQueue.js');
    const queue = getEmbeddingQueue();
    const text = `${doc.title}\n\n${doc.body || ''}`.trim();
    await queue.add(
      {
        postId: doc._id.toString(),
        communityId: doc.community.toString(),
        type: 'post',
        text,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      }
    );
    console.log(`📨 Embedding job queued for post: ${doc._id}`);
  } catch (err) {
    console.error('Failed to queue embedding job:', err.message);
  }
});

const Post = mongoose.model('Post', PostSchema);

export default Post;
