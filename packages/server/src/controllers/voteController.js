// controllers/voteController.js
// Wired to whatever vote endpoint you use, e.g. POST /posts/:id/vote { value: 1 | -1 }

import mongoose from "mongoose";
import Post from "../models/Post.js";
import { computeHotScore, computeRisingScore } from "../utils/scoring.js";

// POST /posts/:id/vote
export async function votePost(req, res) {
  try {
    const { id } = req.params;
    const { value } = req.body; // 1 for upvote, -1 for downvote
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (![1, -1].includes(value)) {
      return res.status(400).json({ error: "value must be 1 or -1" });
    }
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid post id" });
    }

    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    // NOTE: this assumes one vote per user isn't yet tracked elsewhere.
    // If you have a separate Vote collection enforcing one-vote-per-user,
    // check/update it here before mutating counts, and adjust the delta
    // (e.g. switching a vote from -1 to +1 should move score by 2, not 1).
    if (value === 1) {
      post.upvotes += 1;
    } else {
      post.downvotes += 1;
    }
    post.score = post.upvotes - post.downvotes;

    post.voteLog.push({ value, at: new Date(), userId });

    post.hotScore = computeHotScore(post.upvotes, post.downvotes, post.createdAt);

    const { risingScore, trimmedLog } = computeRisingScore(post.voteLog, post.createdAt);
    post.risingScore = risingScore;
    post.voteLog = trimmedLog;

    await post.save();

    return res.json({
      score: post.score,
      hotScore: post.hotScore,
      risingScore: post.risingScore,
    });
  } catch (err) {
    console.error("votePost error:", err);
    return res.status(500).json({ error: "Failed to register vote" });
  }
}