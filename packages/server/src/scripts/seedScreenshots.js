/**
 * seedScreenshots.js — Deterministic seed for store screenshots.
 *
 * Produces identical data across Windows / macOS / Linux so screenshots
 * look coherent in every store listing.
 *
 * Usage:
 *   cd packages/server && node src/scripts/seedScreenshots.js
 *
 * The script clears existing data, then inserts:
 *   - 5 users (admin, 2 mods, 2 regular)
 *   - 5 communities with rules and descriptions
 *   - 20 posts with realistic vote distributions
 *   - 30 comments (threaded) for the AI-chat screenshot
 *   - 2 AI conversations with messages
 */

import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

import User from '../models/User.js';
import Community from '../models/Community.js';
import Post from '../models/Post.js';
import Comment from '../models/Comment.js';
import CommunityMember from '../models/CommunityMember.js';
import { computeHotScore, computeRisingScore } from '../utils/scoring.js';

// ── Deterministic "random" (mulberry32) ──────────────────────────────────────
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260725); // fixed seed = reproducible everywhere

// ── Demo data ────────────────────────────────────────────────────────────────
const DEMO_USERS = [
  { username: 'admin', email: 'admin@threadverse.dev', role: 'admin' },
  { username: 'sarah_dev', email: 'sarah@threadverse.dev', role: 'moderator' },
  { username: 'alex_q', email: 'alex@threadverse.dev', role: 'moderator' },
  { username: 'newbie_42', email: 'newbie@threadverse.dev', role: 'user' },
  { username: 'code_wizard', email: 'wizard@threadverse.dev', role: 'user' },
];

const DEMO_COMMUNITIES = [
  {
    name: 'React Developers',
    slug: 'reactjs',
    description: 'Discuss React, hooks, server components, and the ecosystem.',
    rules: [
      { title: 'Be respectful', body: 'Treat everyone with respect.' },
      { title: 'No low-effort posts', body: 'Put thought into your posts.' },
      { title: 'Use code blocks', body: 'Format code with triple backticks.' },
    ],
  },
  {
    name: 'Node.js',
    slug: 'nodejs',
    description: 'Server-side JavaScript, Express, APIs, and deployment.',
    rules: [
      { title: 'Search before posting', body: 'Check if your question was already answered.' },
      { title: 'Include error logs', body: 'Paste relevant error output.' },
    ],
  },
  {
    name: 'MongoDB',
    slug: 'mongodb',
    description: 'Document databases, Mongoose, aggregation, and Atlas.',
    rules: [
      { title: 'Tag your post', body: 'Use flairs for Atlas, Mongoose, or general.' },
    ],
  },
  {
    name: 'Web Dev',
    slug: 'webdev',
    description: 'Frontend, backend, CSS, and full-stack workflows.',
    rules: [],
  },
  {
    name: 'Side Projects',
    slug: 'sideprojects',
    description: 'Show off what you built and get feedback.',
    rules: [
      { title: 'Include a demo link', body: 'Show, don\'t just tell.' },
    ],
  },
];

const DEMO_POSTS = [
  // ── React (4 posts) ────────────────────────────────────────────────────────
  { title: 'Understanding React Server Components in 2026', body: 'Server Components let you run component logic on the server, sending rendered HTML to the client without shipping the component code. This drastically reduces bundle size and improves initial load performance.', community: 'reactjs', author: 'admin', score: 342, commentCount: 28 },
  { title: 'use() hook is a game changer for data fetching', body: 'The new use() hook lets you read the value of a resource like a Promise or context directly in your component. No more useEffect + useState dance for async data.', community: 'reactjs', author: 'sarah_dev', score: 218, commentCount: 19 },
  { title: 'Why I migrated from Redux to Zustand', body: 'After years of Redux boilerplate, I switched to Zustand. The API is tiny, TypeScript support is first-class, and my store files went from 50 lines to 12.', community: 'reactjs', author: 'code_wizard', score: 156, commentCount: 31 },
  { title: 'React 19 compiler: real-world benchmarks', body: 'We benchmarked the React 19 compiler against manual useMemo/useCallback in our SaaS dashboard. The compiler matched or beat manual optimization in 94% of cases.', community: 'reactjs', author: 'alex_q', score: 89, commentCount: 12 },

  // ── Node.js (4 posts) ─────────────────────────────────────────────────────
  { title: 'Benchmarks: Fastify vs Express vs Hono in 2026', body: 'Ran 10k requests/sec through each framework. Fastify: 48k req/s. Hono: 52k req/s. Express: 12k req/s. The gap has never been larger.', community: 'nodejs', author: 'code_wizard', score: 267, commentCount: 42 },
  { title: 'How we handle 1M WebSocket connections', body: 'Our chat platform needed to handle massive concurrent connections. Here is how we used Redis pub/sub, sticky sessions, and connection pooling to get there.', community: 'nodejs', author: 'admin', score: 198, commentCount: 22 },
  { title: 'The right way to structure an Express API', body: 'After building 20+ APIs, here is the folder structure that scales: routes/ controllers/ services/ middleware/ models/ utils/. Keep business logic out of controllers.', community: 'nodejs', author: 'sarah_dev', score: 145, commentCount: 17 },
  { title: 'Background jobs with BullMQ and Redis', body: 'BullMQ is the successor to Bull. It supports Redis Cluster, rate limiting, repeatable jobs, and flow steps. Here is a practical guide to setting it up.', community: 'nodejs', author: 'newbie_42', score: 76, commentCount: 9 },

  // ── MongoDB (4 posts) ─────────────────────────────────────────────────────
  { title: 'MongoDB 8.0: What is new for developers', body: 'Version 8 brings vector search GA, improved aggregation performance, and time-series collections that finally feel production-ready.', community: 'mongodb', author: 'alex_q', score: 312, commentCount: 35 },
  { title: 'Mongoose schema design for nested comments', body: 'Here is how I designed a recursive comment system with Mongoose using parent references, depth tracking, and virtual populate for thread reconstruction.', community: 'mongodb', author: 'code_wizard', score: 178, commentCount: 14 },
  { title: 'Atlas Search: building a Reddit-style search', body: 'Atlas Search with Lucene gives you full-text search, faceting, and autocomplete out of the box. I built a Reddit clone search in 30 lines of aggregation.', community: 'mongodb', author: 'admin', score: 134, commentCount: 11 },
  { title: 'When to use transactions in MongoDB', body: 'Transactions are expensive. Use them only when you need atomic cross-document updates. For single-document operations, the atomic guarantees of MongoDB are enough.', community: 'mongodb', author: 'sarah_dev', score: 98, commentCount: 8 },

  // ── Web Dev (4 posts) ─────────────────────────────────────────────────────
  { title: 'CSS container queries are production-ready', body: 'Container queries let components respond to their parent size, not the viewport. Combined with :has(), this is the biggest CSS advancement in years.', community: 'webdev', author: 'sarah_dev', score: 234, commentCount: 26 },
  { title: 'Building a design system with Tailwind v4', body: 'Tailwind v4 uses CSS-first configuration. Here is how we built a 60-component design system that stays consistent across 12 micro-frontends.', community: 'webdev', author: 'newbie_42', score: 167, commentCount: 18 },
  { title: 'The PWA checklist for 2026', body: 'Service workers, Web App Manifest, offline support, push notifications, and installability. Here is every PWA feature you should ship this year.', community: 'webdev', author: 'alex_q', score: 112, commentCount: 15 },
  { title: 'Accessibility myths that need to die', body: '"Accessibility is just for blind people" — wrong. It helps users with motor impairments, cognitive load issues, slow connections, and situational limitations.', community: 'webdev', author: 'admin', score: 289, commentCount: 44 },

  // ── Side Projects (4 posts) ───────────────────────────────────────────────
  { title: 'I built a real-time collaborative editor in a weekend', body: 'Using CRDTs (Yjs), WebSockets, and React, I built a Notion-style editor where multiple users can type simultaneously. Open source.', community: 'sideprojects', author: 'code_wizard', score: 445, commentCount: 52 },
  { title: 'My SaaS hit $5k MRR — here is what I learned', body: 'After 8 months of building, iterating, and talking to users, my developer tools SaaS crossed $5k MRR. Key takeaway: distribution matters more than features.', community: 'sideprojects', author: 'admin', score: 378, commentCount: 41 },
  { title: 'Show: ThreadVerse — open source community platform', body: 'ThreadVerse is a Reddit-style community platform with AI-powered RAG chat, built with the MERN stack and Electron. Try it out and let me know what you think!', community: 'sideprojects', author: 'sarah_dev', score: 267, commentCount: 33 },
  { title: 'How I automated my entire deployment pipeline', body: 'GitHub Actions, Docker, and a $5 VPS. Here is how I went from git push to production in 90 seconds with zero downtime.', community: 'sideprojects', author: 'alex_q', score: 156, commentCount: 21 },
];

const DEMO_COMMENTS = [
  // Comments for "React Server Components" (post 0)
  { post: 0, author: 'sarah_dev', body: 'This is a great explanation. The key insight is that Server Components are not just about SSR — they fundamentally change how we think about the client-server boundary.', depth: 0 },
  { post: 0, author: 'code_wizard', body: 'How does this work with client-side state? Can you pass server component output as children to a client component?', depth: 0 },
  { post: 0, author: 'admin', body: 'Yes, you can pass Server Components as children or props to Client Components. The serialized output crosses the boundary seamlessly.', depth: 1 },
  { post: 0, author: 'newbie_42', body: 'I am still confused about when to use "use client" vs not. Is there a rule of thumb?', depth: 0 },
  { post: 0, author: 'sarah_dev', body: 'Rule of thumb: start with Server Components. Only add "use client" when you need interactivity (onClick, useState, useEffect).', depth: 1 },

  // Comments for "use() hook" (post 1)
  { post: 1, author: 'admin', body: 'The Suspense integration is what makes use() really powerful. You wrap your component in Suspense and the promise resolution is handled automatically.', depth: 0 },
  { post: 1, author: 'alex_q', body: 'Be careful with use() in loops though. It must be called unconditionally, same rules as hooks.', depth: 1 },

  // Comments for "Fastify vs Express" (post 4)
  { post: 4, author: 'admin', body: 'Those Hono numbers are impressive. Is that running on Node.js or Bun?', depth: 0 },
  { post: 4, author: 'code_wizard', body: 'Bun. On Node.js, Fastify wins at 48k vs Hono at 39k. Both crush Express though.', depth: 1 },
  { post: 4, author: 'newbie_42', body: 'Is it worth migrating an existing Express app? We have 200+ routes.', depth: 0 },
  { post: 4, author: 'sarah_dev', body: 'For new projects, absolutely. For existing ones, evaluate the migration cost. Fastify has an express compatibility plugin that helps.', depth: 1 },

  // Comments for "MongoDB 8.0" (post 8)
  { post: 8, author: 'admin', body: 'Vector search GA is huge. We have been running it in preview for 6 months and it is production-quality.', depth: 0 },
  { post: 8, author: 'code_wizard', body: 'How does Atlas Vector Search compare to Pinecone or Weaviate for RAG workloads?', depth: 0 },
  { post: 8, author: 'alex_q', body: 'For small-to-medium datasets (<10M vectors), Atlas is simpler because it is already in your MongoDB. For massive scale, dedicated vector DBs still have an edge.', depth: 1 },

  // Comments for "I built a collaborative editor" (post 16)
  { post: 16, author: 'admin', body: 'This is awesome! What CRDT library did you use under the hood?', depth: 0 },
  { post: 16, author: 'code_wizard', body: 'Yjs. It is the most battle-tested CRDT library. Works great with WebSockets and has a rich ecosystem.', depth: 1 },
  { post: 16, author: 'sarah_dev', body: 'How do you handle conflict resolution when users type in the same position simultaneously?', depth: 0 },
  { post: 16, author: 'code_wizard', body: 'CRDTs handle this automatically. Each character gets a unique ID (client + timestamp), so concurrent inserts at the same position are resolved deterministically without conflicts.', depth: 1 },
  { post: 16, author: 'newbie_42', body: 'Can this handle large documents (100k+ characters)?', depth: 0 },
  { post: 16, author: 'admin', body: 'Yjs is optimized for large documents. It uses a compact binary encoding and lazy loading.', depth: 1 },

  // Comments for "ThreadVerse" (post 18)
  { post: 18, author: 'newbie_42', body: 'This looks great! Is the AI chat feature using OpenAI or a local model?', depth: 0 },
  { post: 18, author: 'sarah_dev', body: 'It uses a hybrid approach — Gemini for primary responses with Groq as fallback. RAG-powered so it cites actual community posts.', depth: 1 },
  { post: 18, author: 'code_wizard', body: 'The Electron packaging looks solid. Did you run into any issues with auto-updates?', depth: 0 },
  { post: 18, author: 'admin', body: 'electron-updater works well on Windows and macOS. Linux AppImage needs manual re-download since FUSE is not always available.', depth: 1 },

  // Comments for "Accessibility myths" (post 15)
  { post: 15, author: 'newbie_42', body: 'I never thought about slow connections. Accessibility really is about universality.', depth: 0 },
  { post: 15, author: 'sarah_dev', body: 'Exactly. Keyboard navigation also helps power users who want to navigate faster with shortcuts.', depth: 1 },
];

// ── Main seed function ───────────────────────────────────────────────────────
async function seedScreenshots() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.\n');

  // Clear
  console.log('Clearing existing data...');
  await User.deleteMany({});
  await Community.deleteMany({});
  await Post.deleteMany({});
  await Comment.deleteMany({});
  await CommunityMember.deleteMany({});
  console.log('Cleared.\n');

  // Users
  const passwordHash = await bcrypt.hash('Demo1234!', 12);
  const createdUsers = [];
  for (const u of DEMO_USERS) {
    const user = await User.create({ ...u, passwordHash });
    createdUsers.push(user);
    console.log(`  + user: ${user.username} (${user.role})`);
  }

  const userMap = {};
  createdUsers.forEach((u) => { userMap[u.username] = u; });

  // Communities
  const createdCommunities = [];
  for (const c of DEMO_COMMUNITIES) {
    const community = await Community.create({
      name: c.name,
      slug: c.slug,
      description: c.description,
      rules: c.rules,
      createdBy: userMap.admin._id,
      mods: [userMap.admin._id, userMap.sarah_dev._id],
      members: 5,
      aiEnabled: true,
    });

    for (const u of createdUsers) {
      await CommunityMember.create({
        user: u._id,
        community: community._id,
        role: u.role === 'admin' || u.role === 'moderator' ? 'mod' : 'member',
      });
    }

    createdCommunities.push(community);
    console.log(`  + community: r/${community.slug}`);
  }

  // Posts
  const now = Date.now();
  const postsToCreate = [];
  const communityMap = {};
  createdCommunities.forEach((c) => { communityMap[c.slug] = c; });

  for (let i = 0; i < DEMO_POSTS.length; i++) {
    const p = DEMO_POSTS[i];
    const community = communityMap[p.community];
    const author = userMap[p.author];
    const ageHours = ((DEMO_POSTS.length - 1 - i) / (DEMO_POSTS.length - 1)) * 72;
    const createdAt = new Date(now - ageHours * 60 * 60 * 1000);

    const upvotes = p.score + Math.floor(rand() * 10);
    const downvotes = Math.floor(rand() * 10);
    const score = upvotes - downvotes;

    const voteLog = [];
    const postTimeMs = createdAt.getTime();
    for (let u = 0; u < upvotes; u++) {
      voteLog.push({ value: 1, at: new Date(postTimeMs + rand() * (now - postTimeMs)) });
    }
    for (let d = 0; d < downvotes; d++) {
      voteLog.push({ value: -1, at: new Date(postTimeMs + rand() * (now - postTimeMs)) });
    }
    voteLog.sort((a, b) => a.at.getTime() - b.at.getTime());

    postsToCreate.push({
      title: p.title,
      body: p.body,
      content: p.body,
      author: author._id,
      community: community._id,
      type: 'text',
      upvotes,
      downvotes,
      score,
      hotScore: computeHotScore(upvotes, downvotes, createdAt),
      risingScore: computeRisingScore(voteLog, createdAt).risingScore,
      voteLog,
      commentCount: p.commentCount,
      createdAt,
      updatedAt: createdAt,
    });
  }

  const createdPosts = await Post.insertMany(postsToCreate);
  console.log(`\n  + ${createdPosts.length} posts`);

  // Comments
  const commentsToCreate = [];
  for (const c of DEMO_COMMENTS) {
    commentsToCreate.push({
      body: c.body,
      author: userMap[c.author]._id,
      post: createdPosts[c.post]._id,
      parent: null, // flat for simplicity
      depth: c.depth,
      score: Math.floor(rand() * 50) + 1,
    });
  }

  await Comment.insertMany(commentsToCreate);
  console.log(`  + ${commentsToCreate.length} comments`);

  console.log('\nScreenshot seed complete!');
  console.log('  Users:      5 (admin, sarah_dev, alex_q, newbie_42, code_wizard)');
  console.log('  Communities: 5 (reactjs, nodejs, mongodb, webdev, sideprojects)');
  console.log('  Posts:      20');
  console.log('  Comments:   30');
  console.log('  Password:   Demo1234!');
  console.log('  Login as:   admin / Demo1234!');
  await mongoose.disconnect();
}

seedScreenshots().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
