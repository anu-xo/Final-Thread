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
import CommunityMember from '../models/CommunityMember.js';
import { computeHotScore, computeRisingScore } from '../utils/scoring.js';

const COMMUNITIES = [
  { name: 'React Developers', slug: 'reactjs', description: 'Everything React' },
  { name: 'Node.js', slug: 'nodejs', description: 'Server-side JavaScript' },
  { name: 'MongoDB', slug: 'mongodb', description: 'Document databases' },
  { name: 'Web Dev', slug: 'webdev', description: 'Frontend and backend web development' },
  { name: 'Side Projects', slug: 'sideprojects', description: 'Show off what you built' },
];

async function seed() {
  console.log('⏳ Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // Clear existing data from seeded collections to ensure clean run
  console.log('🧹 Clearing existing seed data...');
  await User.deleteMany({ email: { $regex: /@threadverse\.dev$/ } });
  await Community.deleteMany({ slug: { $in: COMMUNITIES.map((c) => c.slug) } });
  
  // Note: Since posts and community members reference these users/communities,
  // we'll delete all posts and memberships to avoid orphaned records in local dev environment
  await Post.deleteMany({});
  await CommunityMember.deleteMany({});
  console.log('🧹 Collections cleared');

  // 1. Create Users (admin, mod, user)
  console.log('👤 Seeding Users...');
  const passwordHash = await bcrypt.hash('Password123!', 12);
  
  const adminUser = await User.create({
    username: 'admin',
    email: 'admin@threadverse.dev',
    passwordHash,
    role: 'admin',
  });
  
  const modUser = await User.create({
    username: 'mod',
    email: 'mod@threadverse.dev',
    passwordHash,
    role: 'moderator',
  });

  const regularUser = await User.create({
    username: 'user',
    email: 'user@threadverse.dev',
    passwordHash,
    role: 'user',
  });

  const users = [adminUser, modUser, regularUser];
  console.log(`✅ Seeded 3 users: admin, mod, user`);

  // 2. Create 5 Communities
  console.log('🏔 Seeding Communities...');
  const seededCommunities = [];
  for (const cData of COMMUNITIES) {
    const community = await Community.create({
      ...cData,
      createdBy: adminUser._id,
      mods: [adminUser._id, modUser._id],
      members: 3,
      aiEnabled: true,
    });

    // Make all three users members of each community
    for (const user of users) {
      await CommunityMember.create({
        user: user._id,
        community: community._id,
        role: user.role === 'admin' || user.role === 'moderator' ? 'mod' : 'member',
      });
    }

    seededCommunities.push(community);
    console.log(`  ✅ Created r/${community.slug}`);
  }

  // 3. Create 40 Posts
  console.log('📝 Seeding 40 Posts...');
  const now = Date.now();
  const postsToCreate = [];

  for (let i = 1; i <= 40; i++) {
    const community = seededCommunities[(i - 1) % seededCommunities.length];
    const author = users[(i - 1) % users.length];

    // Varied createdAt: distribute from 72 hours ago to now
    // e.g., Post 1 is 72 hours old, Post 40 is brand new
    const ageHours = ((40 - i) / 39) * 72; // ranges from 72h down to 0h
    const createdAt = new Date(now - ageHours * 60 * 60 * 1000);

    // Varied scores: generate random upvotes and downvotes
    // Mix of high positive, negative, and neutral scores
    let upvotes, downvotes;
    if (i % 8 === 0) {
      // Negative score post
      upvotes = Math.floor(Math.random() * 5);
      downvotes = Math.floor(Math.random() * 15) + 5;
    } else if (i % 3 === 0) {
      // High score post
      upvotes = Math.floor(Math.random() * 150) + 50;
      downvotes = Math.floor(Math.random() * 20);
    } else {
      // Moderate score post
      upvotes = Math.floor(Math.random() * 30) + 5;
      downvotes = Math.floor(Math.random() * 10);
    }

    const score = upvotes - downvotes;

    // Generate vote log to simulate velocity
    const voteLog = [];
    const postTimeMs = createdAt.getTime();
    
    // Add positive votes
    for (let u = 0; u < upvotes; u++) {
      // Distribute votes randomly between post creation time and now
      const voteTime = new Date(postTimeMs + Math.random() * (now - postTimeMs));
      voteLog.push({ value: 1, at: voteTime });
    }

    // Add negative votes
    for (let d = 0; d < downvotes; d++) {
      const voteTime = new Date(postTimeMs + Math.random() * (now - postTimeMs));
      voteLog.push({ value: -1, at: voteTime });
    }

    // Sort voteLog by time ascending
    voteLog.sort((a, b) => a.at.getTime() - b.at.getTime());

    // Calculate scores using official scoring functions
    const hotScore = computeHotScore(upvotes, downvotes, createdAt);
    const { risingScore } = computeRisingScore(voteLog, createdAt);

    const postData = {
      title: `Post #${i}: ${getRandomTitle(i, community.slug)}`,
      body: `This is a beautiful and detailed discussion for post #${i} in the r/${community.slug} community. Threadverse is a modern web application built with Node, Express, Mongoose, and React. Feel free to comment or upvote/downvote!`,
      content: `This is a beautiful and detailed discussion for post #${i} in the r/${community.slug} community. Threadverse is a modern web application built with Node, Express, Mongoose, and React. Feel free to comment or upvote/downvote!`,
      author: author._id,
      community: community._id,
      type: 'text',
      upvotes,
      downvotes,
      score,
      hotScore,
      risingScore,
      voteLog,
      createdAt,
      updatedAt: createdAt,
    };

    postsToCreate.push(postData);
  }

  // Use insertMany to bypass save hooks (so we don't spam the embedding queue during seeding,
  // and we keep our custom scores intact).
  await Post.insertMany(postsToCreate);
  console.log(`✅ Seeded 40 posts successfully`);

  console.log('🎉 Database seeding complete!');
  await mongoose.disconnect();
}

function getRandomTitle(index, slug) {
  const topics = {
    reactjs: [
      'Is React 19 going to change everything?',
      'Why I switched from React to Vue and back again',
      'The ultimate guide to state management in 2026',
      'Understanding Server Components: A visual guide',
      'React Hook Form vs Formik in enterprise apps',
      'My setup for Next.js and Tailwind CSS v4',
      'How to optimize React rendering performance',
      'Custom hooks you should copy-paste today',
    ],
    nodejs: [
      'Node.js vs Bun vs Deno: 2026 performance benchmark',
      'Building scalable real-time servers with Socket.io',
      'How to structure your Express controllers and routes',
      'Why you should use fastify instead of Express',
      'Streams in Node.js: Everything you need to know',
      'Writing secure REST APIs with Helmet and CORS',
      'Dockerizing a Node.js monorepo workspace',
      'Handling background workers with Bull and Redis',
    ],
    mongodb: [
      'Understanding Mongoose pre/post save hooks',
      'MongoDB aggregation pipelines by example',
      'How to index your fields for ultra-fast queries',
      'Designing schemas for a nested comment tree',
      'Transactions in MongoDB: When and how to use them',
      'Mongoose middleware gotchas to avoid',
      'Atlas Search: Implementing vector similarity search',
      'Relational vs Document databases: Choose wisely',
    ],
    webdev: [
      'The modern frontend stack in 2026',
      'CSS Grid vs Flexbox: The final showdown',
      'Best SEO practices for dynamic web apps',
      'Understanding CORS and CSRF prevention',
      'What is Glassmorphism and how to style it',
      'Why semantic HTML matters more than ever',
      'Micro-frontends: The good, the bad, and the ugly',
      'PWA features you can add to your web app in 5 minutes',
    ],
    sideprojects: [
      'Show HN: I built a real-time Reddit clone in 2 days',
      'How my side project got 10k users in a week',
      'Failed projects: What I learned from 5 startup attempts',
      'Building an Electron desktop client for Threadverse',
      'Here is the stack I use for rapid prototyping',
      'How to host your web apps completely for free',
      'Open sourcing my side project: Lessons learned',
      'The feedback loops that helped refine my UI design',
    ],
  };

  const list = topics[slug] || ['General topic thread'];
  return list[index % list.length];
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
