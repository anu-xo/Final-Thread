// controllers/commentController.js

import mongoose from "mongoose";
import Comment from "../models/Comment.js"; // adjust path to your Comment model
import ModerationLog from "../models/ModerationLog.js";
import { classifyContent } from "../services/moderationService.js";

export async function createComment(req, res) {
  try {
    const { body, communityId } = req.body;
    const authorId = req.user?.id || req.user?._id;

    if (!authorId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!body || !body.trim()) {
      return res.status(400).json({ error: "Comment body is required" });
    }

    // 1. Run the moderation check
    const label = await classifyContent(body);

    // 2. Log the decision
    await ModerationLog.create({
      targetType: 'comment',
      content: body.slice(0, 500),
      label,
      author: authorId,
      community: communityId || null, // Optional if comment isn't tied directly to communityId
    });

    // 3. Block if unsafe
    if (label !== 'SAFE') {
      return res.status(422).json({
        data: null,
        error: `Content flagged as ${label} and was not published.`,
        meta: null,
      });
    }

    // 4. Create the comment if safe
    const comment = await Comment.create({
      body,
      author: authorId,
      post: req.body.postId, // adapt to whatever your comment model requires
    });

    return res.status(201).json({ comment });
  } catch (err) {
    console.error("createComment error:", err);
    return res.status(500).json({ error: "Failed to create comment" });
  }
}