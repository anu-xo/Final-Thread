// controllers/postController.js

import mongoose from "mongoose";
import Post from "../models/Post.js";
import Community from "../models/Community.js"; 
import Vote from "../models/Vote.js";
import { computeHotScore, encodeCursor, decodeCursor } from "../utils/scoring.js";
import { resolveViewerUserId } from "../utils/voteResponse.js";
import { classifyContent } from '../services/moderationService.js';
import ModerationLog from '../models/ModerationLog.js';
import { logActivity } from '../middleware/activityLog.js';

const SORT_FIELDS = {
  new: "createdAt",
  top: "score",
  hot: "hotScore",
  rising: "risingScore",
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * Resolve a `community` query/body value that could be either a valid
 * ObjectId or a slug, and return the Community's ObjectId.
 */
async function resolveCommunityId(communityParam) {
  if (!communityParam) return null;

  if (mongoose.isValidObjectId(communityParam)) {
    return communityParam;
  }

  const community = await Community.findOne({ slug: communityParam }).select("_id");
  return community ? community._id.toString() : null;
}

// POST /posts
export async function createPost(req, res) {
  try {
    const {
      title,
      content,
      body,
      community,
      type,
      media = [],
      url,
      flair,
    } = req.body;
    
    const authorId = req.user?.id || req.user?._id;
    const postBody = body ?? content ?? "";
    const postType = type ?? (Array.isArray(media) && media.length > 0 ? "image" : (url ? "link" : "text"));
    const normalizedMedia = Array.isArray(media) ? media.filter(Boolean) : [];

    if (!authorId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!title || !community) {
      return res.status(400).json({ error: "title and community are required" });
    }

    if (postType === "text" && !postBody.trim()) {
      return res.status(400).json({ error: "body/content is required for text posts" });
    }

    if (postType === "link" && !url) {
      return res.status(400).json({ error: "url is required for link posts" });
    }

    if (postType === "image" && normalizedMedia.length === 0) {
      return res.status(400).json({ error: "media is required for image posts" });
    }

    const communityId = await resolveCommunityId(community);
    if (!communityId) {
      return res.status(404).json({ error: "Community not found" });
    }

    // 1. Run the moderation check on title + the resolved text body
    const label = await classifyContent(`${title || ''} ${postBody}`);

    // 2. Log the decision
    await ModerationLog.create({
      targetType: 'post',
      content: postBody.slice(0, 500),
      label,
      author: authorId,
      community: communityId,
    });

    // 3. Block if unsafe
    if (label !== 'SAFE') {
      return res.status(422).json({
        data: null,
        error: `Content flagged as ${label} and was not published.`,
        meta: null,
      });
    }

    const now = new Date();

    // Seed with a self-upvote (1, 0) so hotScore isn't 0 for every brand-new post
    const initialUpvotes = 1;
    const initialDownvotes = 0;
    const initialHotScore = computeHotScore(initialUpvotes, initialDownvotes, now);

    const post = await Post.create({
      title,
      body: postBody,
      content: postBody,
      author: authorId,
      community: communityId,
      type: postType,
      url: url ?? null,
      media: normalizedMedia,
      flair: flair ?? null,
      upvotes: initialUpvotes,
      downvotes: initialDownvotes,
      score: initialUpvotes - initialDownvotes,
      hotScore: initialHotScore,
      risingScore: 0,
      createdAt: now,
    });

    const populated = await post.populate("author", "username avatarUrl");

    logActivity('post.created', req, { postId: post._id, community: communityId, type: postType });

    return res.status(201).json({ post: populated });
  } catch (err) {
    console.error("createPost error:", err);
    return res.status(500).json({ error: "Failed to create post" });
  }
}

// GET /posts?community=&sort=&cursor=&limit=
export async function getPosts(req, res) {
  try {
    const { community, sort = "new", cursor, limit, since } = req.query;
    const viewerUserId = await resolveViewerUserId(req);

    const sortField = SORT_FIELDS[sort];
    if (!sortField) {
      return res.status(400).json({ error: `sort must be one of: ${Object.keys(SORT_FIELDS).join(", ")}` });
    }

    const pageLimit = Math.min(parseInt(limit, 10) || DEFAULT_LIMIT, MAX_LIMIT);

    const query = {};

    if (community) {
      const communityId = await resolveCommunityId(community);
      if (!communityId) {
        return res.status(404).json({ error: "Community not found" });
      }
      query.community = communityId;
    }

    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        query.createdAt = { $gte: sinceDate };
      }
    }

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (!decoded || decoded.v === undefined || !decoded.id) {
        return res.status(400).json({ error: "Invalid cursor" });
      }

      const sortValue = sortField === "createdAt" ? new Date(decoded.v) : decoded.v;

      query.$or = [
        { [sortField]: { $lt: sortValue } },
        { [sortField]: sortValue, _id: { $lt: decoded.id } },
      ];
    }

    const posts = await Post.find(query)
      .sort({ [sortField]: -1, _id: -1 })
      .limit(pageLimit + 1)
      .populate("author", "username avatarUrl")
      .lean();

    const hasMore = posts.length > pageLimit;
    const pageItems = hasMore ? posts.slice(0, pageLimit) : posts;

    const postIds = pageItems.map((post) => post._id);
    let voteMap = new Map();
    if (viewerUserId && postIds.length > 0) {
      const votes = await Vote.find({
        user: viewerUserId,
        target: { $in: postIds },
        targetType: "post",
      }).lean();

      voteMap = new Map(votes.map((vote) => [String(vote.target), vote.value]));
    }

    const enrichedPageItems = pageItems.map((post) => ({
      ...post,
      userVote: voteMap.get(String(post._id)) || 0,
    }));

    let nextCursor = null;
    if (hasMore) {
      const last = pageItems[pageItems.length - 1];
      nextCursor = encodeCursor(last[sortField], last._id);
    }

    return res.json({
      posts: enrichedPageItems,
      nextCursor,
      hasMore,
    });
  } catch (err) {
    console.error("getPosts error:", err);
    return res.status(500).json({ error: "Failed to fetch posts" });
  }
}

// GET /posts/:id
export async function getPostById(req, res) {
  try {
    const { id } = req.params;
    const viewerUserId = await resolveViewerUserId(req);

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid post id" });
    }

    const post = await Post.findById(id)
      .populate("author", "username avatarUrl")
      .populate("community", "name slug")
      .lean();

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    const votes = viewerUserId ? await Vote.find({
        user: viewerUserId,
        target: { $in: [id] },
        targetType: "post",
      }).lean() : [];

    const voteMap = new Map(votes.map((vote) => [String(vote.target), vote.value]));

    return res.json({
      post: {
        ...post,
        userVote: voteMap.get(String(post._id)) || 0,
      },
    });
  } catch (err) {
    console.error("getPostById error:", err);
    return res.status(500).json({ error: "Failed to fetch post" });
  }
}