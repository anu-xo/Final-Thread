import mongoose from "mongoose";
import { buildEmbeddingPayload } from "../utils/embeddingPayloads.js";

const voteLogEntrySchema = new mongoose.Schema(
  {
    value: {
      type: Number,
      enum: [1, -1],
      required: true,
    },
    at: {
      type: Date,
      default: Date.now,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { _id: false }
);

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
      default: "",
    },

    content: {
      type: String,
      default: "",
    },

    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    community: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Community",
      required: true,
    },

    type: {
      type: String,
      enum: ["text", "link", "image"],
      default: "text",
    },

    url: {
      type: String,
      default: null,
    },

    media: {
      type: [String],
      default: [],
    },

    flair: {
      type: String,
      default: null,
    },

    isRemoved: {
      type: Boolean,
      default: false,
    },

    // Voting
    upvotes: {
      type: Number,
      default: 0,
    },

    downvotes: {
      type: Number,
      default: 0,
    },

    score: {
      type: Number,
      default: 0, // upvotes - downvotes
    },

    hotScore: {
      type: Number,
      default: 0,
      index: true,
    },

    risingScore: {
      type: Number,
      default: 0,
      index: true,
    },

    voteLog: {
      type: [voteLogEntrySchema],
      default: [],
    },

    commentCount: {
      type: Number,
      default: 0,
    },

    embeddingStatus: {
      type: String,
      enum: ["pending", "processing", "done", "failed"],
      default: "pending",
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    isPinned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for community feed sorting
PostSchema.index({ community: 1, createdAt: -1, _id: -1 });
PostSchema.index({ community: 1, score: -1, _id: -1 });
PostSchema.index({ community: 1, hotScore: -1, _id: -1 });
PostSchema.index({ community: 1, risingScore: -1, _id: -1 });

// Queue embedding after creating a post
PostSchema.post("save", async function (doc) {
  try {
    const { getEmbeddingQueue } = await import("../jobs/embeddingQueue.js");

    const queue = getEmbeddingQueue();

    const payload = buildEmbeddingPayload({
      type: "post",
      document: doc,
      communityId: doc.community,
    });

    await queue.add(payload, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    console.log(`📨 Embedding job queued for post: ${doc._id}`);
  } catch (err) {
    console.error("Failed to queue embedding job:", err.message);
  }
});

const Post = mongoose.model("Post", PostSchema);

export default Post;