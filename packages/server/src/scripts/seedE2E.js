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
import { computeHotScore } from '../utils/scoring.js';

async function seedE2E() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected');

  console.log('Clearing existing data...');
  await User.deleteMany({});
  await Community.deleteMany({});
  await Post.deleteMany({});
  await Comment.deleteMany({});
  await CommunityMember.deleteMany({});

  const passwordHash = await bcrypt.hash('Password123!', 12);

  const admin = await User.create({ username: 'admin', email: 'admin@e2e.test', passwordHash, role: 'admin', emailVerified: true });
  const mod = await User.create({ username: 'moderator', email: 'mod@e2e.test', passwordHash, role: 'moderator', emailVerified: true });
  const alice = await User.create({ username: 'alice', email: 'alice@e2e.test', passwordHash, role: 'user', emailVerified: true });
  const bob = await User.create({ username: 'bob', email: 'bob@e2e.test', passwordHash, role: 'user', emailVerified: true });

  const community = await Community.create({
    name: 'E2E Testing', slug: 'e2e-testing',
    description: 'Community for automated tests',
    createdBy: admin._id, mods: [admin._id, mod._id], members: 4, aiEnabled: true,
  });
  const community2 = await Community.create({
    name: 'Web Dev', slug: 'web-dev',
    description: 'Web development discussion',
    createdBy: admin._id, mods: [admin._id], members: 1, aiEnabled: true,
  });

  for (const u of [admin, mod, alice, bob]) {
    await CommunityMember.create({ user: u._id, community: community._id, role: u.role === 'admin' || u.role === 'moderator' ? 'mod' : 'member' });
  }
  await CommunityMember.create({ user: alice._id, community: community2._id, role: 'member' });

  const now = new Date();
  const post1 = await Post.create({
    title: 'Welcome to E2E Testing',
    body: 'This post is created by the seed helper for automated tests.',
    content: 'This post is created by the seed helper for automated tests.',
    author: alice._id, community: community._id, type: 'text',
    upvotes: 10, downvotes: 0, score: 10,
    hotScore: computeHotScore(10, 0, now), createdAt: now,
  });
  await Post.create({
    title: 'How to configure Playwright',
    body: 'A guide for setting up Playwright in your project.',
    content: 'A guide for setting up Playwright in your project.',
    author: bob._id, community: community2._id, type: 'text',
    upvotes: 5, downvotes: 1, score: 4,
    hotScore: computeHotScore(5, 1, now), createdAt: now,
  });

  console.log('E2E test data seeded:');
  console.log(`  Users: admin, moderator, alice, bob (password: Password123!)`);
  console.log(`  Communities: r/e2e-testing (4 members), r/web-dev (1 member)`);
  console.log(`  Posts: "Welcome to E2E Testing" (r/e2e-testing), "How to configure Playwright" (r/web-dev)`);

  await mongoose.disconnect();
  console.log('Done');
}

seedE2E().catch(err => { console.error('Seed failed:', err); process.exit(1); });
