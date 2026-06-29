import mongoose from 'mongoose';

const postEmbeddingSchema = new mongoose.Schema(
  {
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    communityId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },
    type: {
      type: String,
      enum: ['post', 'comment'],
      default: 'post',
    },
    text: {
      type: String,
      required: true,
    },
    embedding: {
      type: [Number],
      required: true,
    },
  },
  { timestamps: true }
);

const PostEmbedding = mongoose.model('PostEmbedding', postEmbeddingSchema);

export default PostEmbedding;
