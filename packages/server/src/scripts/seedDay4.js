import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

import mongoose from 'mongoose';
import Community from '../models/Community.js';
import User from '../models/User.js';
import CommunityMember from '../models/CommunityMember.js';

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
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected');

  // Find or create a seed admin user
  let admin = await User.findOne({ username: 'seedadmin' });
  if (!admin) {
    const bcrypt = (await import('bcrypt')).default;
    admin = await User.create({
      username: 'seedadmin',
      email: 'seedadmin@threadverse.dev',
      passwordHash: await bcrypt.hash('Admin1234!', 12),
      role: 'admin',
    });
    console.log('✅ Created seed admin user');
  }

  for (const data of COMMUNITIES) {
    const exists = await Community.findOne({ slug: data.slug });
    if (exists) {
      console.log(`  ⏭ Skipping ${data.slug} (already exists)`);
      continue;
    }

    const community = await Community.create({
      ...data,
      createdBy: admin._id,
      mods: [admin._id],
      members: 1,
      aiEnabled: true,
    });

    await CommunityMember.create({
      user: admin._id,
      community: community._id,
      role: 'mod',
    });

    console.log(`  ✅ Created ${data.name} (${data.slug})`);
  }

  console.log('✅ Seed complete');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});