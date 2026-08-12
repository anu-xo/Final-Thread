// packages/server/src/scripts/evalFixtures/index.js
//
// Nightly eval fixtures for the neo layer suites (Day 24 / Day 25).
// postId references are resolved at eval time from the live DB so a reseed
// never orphans them: mention samples pair authored questions with real
// seeded posts, summary samples pick threads with a healthy comment count,
// and digest samples reference communities by their stable hardcoded IDs
// (same IDs evalQuestions.json uses).

import Post from '../../models/Post.js';
import Comment from '../../models/Comment.js';
import {
  NEO_EVAL_MENTION_SAMPLE_SIZE,
  NEO_EVAL_SUMMARY_SAMPLE_SIZE,
  NEO_EVAL_DIGEST_SAMPLE_SIZE,
} from '../../config/neoConfig.js';

import mentionSamples from './mentions.json' with { type: 'json' };
import summarySamples from './summaries.json' with { type: 'json' };
import digestSamples from './digest.json' with { type: 'json' };

const DEFAULT_MIN_THREAD_COMMENTS = 5;

export async function resolveMentionFixtures() {
  const posts = await Post.find({ isRemoved: false })
    .sort({ score: -1 })
    .limit(NEO_EVAL_MENTION_SAMPLE_SIZE)
    .select('_id community')
    .lean();

  const fixtures = [];
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const sample = mentionSamples[i % mentionSamples.length];
    const trigger = await Comment.findOne({ post: post._id, isRemoved: false })
      .sort({ score: -1 })
      .select('body')
      .lean();

    fixtures.push({
      postId: post._id.toString(),
      communityId: post.community.toString(),
      triggerCommentBody: trigger?.body || sample.triggerCommentBody,
      question: sample.question,
    });
  }
  return fixtures;
}

export async function resolveSummaryFixtures() {
  const minComments = summarySamples[0]?.minComments ?? DEFAULT_MIN_THREAD_COMMENTS;

  const threads = await Comment.aggregate([
    { $match: { isRemoved: false, isNeo: false } },
    { $group: { _id: '$post', commentCount: { $sum: 1 } } },
    { $match: { commentCount: { $gte: minComments } } },
    { $sort: { commentCount: -1 } },
    { $limit: NEO_EVAL_SUMMARY_SAMPLE_SIZE },
  ]);

  const postIds = threads.map((t) => t._id);
  const posts = await Post.find({ _id: { $in: postIds } })
    .select('_id community')
    .lean();
  const postById = new Map(posts.map((p) => [p._id.toString(), p]));

  return threads
    .map((t) => {
      const post = postById.get(t._id.toString());
      if (!post) return null;
      return {
        postId: post._id.toString(),
        communityId: post.community.toString(),
        commentCount: t.commentCount,
      };
    })
    .filter(Boolean);
}

export async function resolveDigestFixtures() {
  return digestSamples.slice(0, NEO_EVAL_DIGEST_SAMPLE_SIZE).map((s) => ({
    communityId: String(s.communityId),
  }));
}
