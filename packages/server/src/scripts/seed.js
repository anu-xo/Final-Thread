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
  { name: 'Cooking', slug: 'cooking', description: 'Recipes, meal ideas, and kitchen wins' },
  { name: 'Gardening', slug: 'gardening', description: 'Plants, yards, and green thumbs' },
  { name: 'Pet Owners', slug: 'pets', description: 'Life with dogs, cats, and every critter in between' },
  { name: 'Book Club', slug: 'books', description: 'Monthly reads and great recommendations' },
  { name: 'Home Fitness', slug: 'homefitness', description: 'Workouts that fit around real life' },
  { name: 'Movies & TV', slug: 'movies', description: 'What is worth watching this week' },
  { name: 'Parenting', slug: 'parenting', description: 'Honest tips for raising little humans' },
  { name: 'Personal Finance', slug: 'personalfinance', description: 'Budgeting, saving, and smart money habits' },
  { name: 'Local City', slug: 'localcity', description: 'Neighborhood news, events, and hidden gems nearby' },
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

  // System "Neo" author — no password, never logs in. Idempotent so a reseed
  // doesn't duplicate it (its email is outside the @threadverse.dev delete scope).
  const neoUser = await User.findOne({ username: 'neo-ai' });
  if (!neoUser) {
    await User.create({
      username: 'neo-ai',
      email: 'neo@threadverse.internal',
      passwordHash: null,
      role: 'user',
      isSystemAccount: true,
      karma: 0,
    });
    console.log('✅ Seeded Neo system user (neo-ai)');
  } else {
    console.log('ℹ️  Neo system user (neo-ai) already exists');
  }

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
    console.log(`  ✅ Created ${community.name} (${community.slug})`);
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
      body: `This is a friendly discussion thread for post #${i} in the ${community.name} community. Share your experiences, tips, and questions below — everyone is welcome. Feel free to comment or upvote/downvote!`,
      content: `This is a friendly discussion thread for post #${i} in the ${community.name} community. Share your experiences, tips, and questions below — everyone is welcome. Feel free to comment or upvote/downvote!`,
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
    cooking: [
      'Your go-to weeknight dinner in 20 minutes or less',
      'One-pot pasta recipes that actually taste great',
      'The best way to keep fresh herbs alive all week',
      'Slow cooker wins: set it and forget it',
      'Budget meal prep ideas for busy weeks',
      'What is in your emergency pantry, and why?',
      'The secret to perfectly fluffy pancakes',
      'Baking bread at home without any fancy gear',
    ],
    gardening: [
      'Getting started: the easiest plants for beginners',
      'Should I water in the morning or the evening?',
      'My tomato plants are thriving and I need to brag',
      'Building a raised garden bed on a budget',
      'How to start composting in a small backyard',
      'Indoor plants that survive low light',
      'Dealing with garden pests without harsh chemicals',
      'First harvest of the season! Show us your haul',
    ],
    pets: [
      'Help: my puppy will not stop chewing everything',
      'The moment our rescue cat finally trusted us',
      'Best toys for a bored indoor dog',
      'What do you feed a picky cat?',
      'Senior pets: tips for their golden years',
      'A first-time fish owner starter guide',
      'Grooming basics you can easily do at home',
      'Adopting vs buying: our experience with both',
    ],
    books: [
      'What are you reading this month?',
      'Books that got me out of a reading slump',
      'Best summer reads under 300 pages',
      'A cozy mystery series you cannot put down',
      'Books that feel like a warm hug',
      'Non-fiction that reads like a novel',
      'Your favorite author of all time, and why',
      'Reading with kids: bedtime favorites',
    ],
    homefitness: [
      'A 30-minute bodyweight workout with zero equipment',
      'Starting a morning stretch routine that sticks',
      'Walking is underrated: my 8-week progress',
      'How to build a home gym for under $100',
      'Knee-friendly exercises for beginners',
      'What actually helped me lose the first 10 pounds',
      'Strength training at home for absolute beginners',
      'Staying motivated when you really do not feel like it',
    ],
    movies: [
      'What did you watch this weekend?',
      'Shows worth binging with your partner',
      'The best feel-good movie for a bad day',
      'Documentaries that changed how I see the world',
      'A show that got better after the first season',
      'Movie night snacks: what are we making?',
      'Hidden gem films nobody seems to talk about',
      'Comfort reruns you have watched ten times',
    ],
    parenting: [
      'Bedtime routines that actually work',
      'Toddler tantrums: survival tips from the trenches',
      'Packing school lunches kids will actually eat',
      'Screen time limits that feel reasonable',
      'The best advice I got from other parents',
      'Surviving the newborn months, day by day',
      'Talking to kids about money, simply',
      'Family activities for a rainy weekend',
    ],
    personalfinance: [
      'First budget: where do I even start?',
      'Building an emergency fund from zero',
      'Paying off credit card debt, one payment at a time',
      'What is a good savings rate for beginners?',
      'Meal planning to cut your grocery bill',
      'Side gigs that are actually worth the time',
      'Insurance basics everyone should understand',
      'Small wins that added up this year',
    ],
    localcity: [
      'Best cheap eats in town, go',
      'What is happening in the neighborhood this month',
      'A hidden park nobody seems to know about',
      'Commute hacks for getting around faster',
      'Volunteer spots that are looking for a hand',
      'Where to watch the big game with friends',
      'New to town: where should I start?',
      'Weekend trips within easy driving distance',
    ],
  };

  const list = topics[slug] || ['General topic thread'];
  return list[index % list.length];
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
