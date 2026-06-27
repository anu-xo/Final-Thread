const mongoose = require('mongoose')

const postEmbeddingSchema = new mongoose.Schema(
  {
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
      index: true,
    },
    communityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Community',
      required: true,
      index: true,
    },
    // 'post' or 'comment' — for filtered vector search
    type: {
      type: String,
      enum: ['post', 'comment'],
      default: 'post',
    },
    // The text that was embedded (title + body for posts)
    text: {
      type: String,
      required: true,
    },
    // 768-dimensional vector from Gemini text-embedding-004
    embedding: {
      type: [Number],
      required: true,
      validate: {
        validator: (arr) => arr.length === 768,
        message: 'Embedding must be exactly 768 dimensions',
      },
    },
  },
  { timestamps: true }
)

// Compound index for community-scoped queries
postEmbeddingSchema.index({ communityId: 1, type: 1 })

/*
  IMPORTANT — MongoDB Atlas Vector Search index must be created manually in Atlas UI:
  Collection: threadverse.postembeddings
  Index name: vector_index
  Configuration:
  {
    "fields": [{
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    }]
  }
*/

module.exports = mongoose.model('PostEmbedding', postEmbeddingSchema)