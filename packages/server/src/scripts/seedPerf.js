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

const TARGET_POSTS = 1000;

const COMMUNITIES = [
  { name: 'React Developers', slug: 'reactjs', description: 'Everything React' },
  { name: 'Node.js', slug: 'nodejs', description: 'Server-side JavaScript' },
  { name: 'MongoDB', slug: 'mongodb', description: 'Document databases' },
  { name: 'Web Dev', slug: 'webdev', description: 'Frontend and backend web development' },
  { name: 'Side Projects', slug: 'sideprojects', description: 'Show off what you built' },
];

const TITLE_POOL = [
  'Is React 19 going to change everything?',
  'Why I switched from React to Vue and back again',
  'The ultimate guide to state management in 2026',
  'Understanding Server Components: A visual guide',
  'React Hook Form vs Formik in enterprise apps',
  'My setup for Next.js and Tailwind CSS v4',
  'How to optimize React rendering performance',
  'Custom hooks you should copy-paste today',
  'Node.js vs Bun vs Deno: 2026 performance benchmark',
  'Building scalable real-time servers with Socket.io',
  'How to structure your Express controllers and routes',
  'Why you should use fastify instead of Express',
  'Streams in Node.js: Everything you need to know',
  'Writing secure REST APIs with Helmet and CORS',
  'Dockerizing a Node.js monorepo workspace',
  'Handling background workers with Bull and Redis',
  'Understanding Mongoose pre/post save hooks',
  'MongoDB aggregation pipelines by example',
  'How to index your fields for ultra-fast queries',
  'Designing schemas for a nested comment tree',
  'Transactions in MongoDB: When and how to use them',
  'Mongoose middleware gotchas to avoid',
  'Atlas Search: Implementing vector similarity search',
  'Relational vs Document databases: Choose wisely',
  'The modern frontend stack in 2026',
  'CSS Grid vs Flexbox: The final showdown',
  'Best SEO practices for dynamic web apps',
  'Understanding CORS and CSRF prevention',
  'What is Glassmorphism and how to style it',
  'Why semantic HTML matters more than ever',
  'Micro-frontends: The good, the bad, and the ugly',
  'PWA features you can add to your web app in 5 minutes',
  'Show HN: I built a real-time Reddit clone in 2 days',
  'How my side project got 10k users in a week',
  'Failed projects: What I learned from 5 startup attempts',
  'Building an Electron desktop client for Threadverse',
  'Here is the stack I use for rapid prototyping',
  'How to host your web apps completely for free',
  'Open sourcing my side project: Lessons learned',
  'The feedback loops that helped refine my UI design',
];

async function seed() {
  console.time('total');
  console.log('⏳ Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  console.log('🧹 Clearing existing data...');
  await Post.deleteMany({});
  await CommunityMember.deleteMany({});
  await User.deleteMany({ email: { $regex: /@threadverse\.dev$/ } });
  await Community.deleteMany({ slug: { $in: COMMUNITIES.map((c) => c.slug) } });
  console.log('🧹 Collections cleared');

  console.log('👤 Seeding users...');
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
  console.log('✅ Seeded 3 users');

  console.log('🏔 Seeding communities...');
  const seededCommunities = [];
  for (const cData of COMMUNITIES) {
    const community = await Community.create({
      ...cData,
      createdBy: adminUser._id,
      mods: [adminUser._id, modUser._id],
      members: 3,
      aiEnabled: true,
    });

    for (const user of users) {
      await CommunityMember.create({
        user: user._id,
        community: community._id,
        role: user.role === 'admin' || user.role === 'moderator' ? 'mod' : 'member',
      });
    }

    seededCommunities.push(community);
    console.log(`  ✅ r/${community.slug}`);
  }

  console.log(`📝 Seeding ${TARGET_POSTS} posts...`);
  const now = Date.now();
  const postsToCreate = [];
  const BATCH_SIZE = 100;

  for (let i = 1; i <= TARGET_POSTS; i++) {
    const community = seededCommunities[(i - 1) % seededCommunities.length];
    const author = users[(i - 1) % users.length];

    const ageHours = ((TARGET_POSTS - i) / (TARGET_POSTS - 1)) * 168;
    const createdAt = new Date(now - ageHours * 60 * 60 * 1000);

    let upvotes, downvotes;
    if (i % 12 === 0) {
      upvotes = Math.floor(Math.random() * 5);
      downvotes = Math.floor(Math.random() * 20) + 5;
    } else if (i % 4 === 0) {
      upvotes = Math.floor(Math.random() * 200) + 50;
      downvotes = Math.floor(Math.random() * 30);
    } else {
      upvotes = Math.floor(Math.random() * 40) + 5;
      downvotes = Math.floor(Math.random() * 12);
    }

    const score = upvotes - downvotes;

    const voteLog = [];
    const postTimeMs = createdAt.getTime();
    const maxVotes = Math.min(upvotes + downvotes, 30);

    for (let v = 0; v < maxVotes; v++) {
      const voteTime = new Date(postTimeMs + Math.random() * (now - postTimeMs));
      voteLog.push({ value: v < upvotes ? 1 : -1, at: voteTime });
    }
    voteLog.sort((a, b) => a.at.getTime() - b.at.getTime());

    const hotScore = computeHotScore(upvotes, downvotes, createdAt);
    const { risingScore } = computeRisingScore(voteLog, createdAt);

    const titleIdx = (i - 1) % TITLE_POOL.length;
    const topicLabel = community.slug;

    postsToCreate.push({
      title: `[${topicLabel}] #${i}: ${TITLE_POOL[titleIdx]}`,
      body: `Seed post #${i} for r/${topicLabel}. This is a performance benchmark post used to test scroll rendering with 1000 posts in the feed.`,
      content: `Seed post #${i} for r/${topicLabel}. This is a performance benchmark post used to test scroll rendering with 1000 posts in the feed.`,
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
    });

    if (postsToCreate.length >= BATCH_SIZE || i === TARGET_POSTS) {
      await Post.insertMany(postsToCreate);
      process.stdout.write(`\r  📦 Inserted ${i}/${TARGET_POSTS}`);
      postsToCreate.length = 0;
    }
  }

  console.log(`\n✅ Seeded ${TARGET_POSTS} posts successfully`);
  console.timeEnd('total');
  console.log('🎉 Done!');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
