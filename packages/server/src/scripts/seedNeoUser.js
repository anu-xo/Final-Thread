// Seed the system "Neo" author once.
// Run: pnpm --filter server seed:neo   (or `node src/scripts/seedNeoUser.js`)
// Idempotent — safe to run repeatedly.
import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

import User from '../models/User.js';

const NEO_USERNAME = 'neo-ai';
const NEO_EMAIL = 'neo@threadverse.internal';

async function seedNeoUser() {
  console.log('⏳ Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const existing = await User.findOne({ username: NEO_USERNAME });

  if (existing) {
    console.log(`ℹ️  System user "${NEO_USERNAME}" already exists (${existing._id})`);
  } else {
    await User.create({
      username: NEO_USERNAME,
      email: NEO_EMAIL,
      passwordHash: null, // no password — the auth routes reject this account
      role: 'user',
      isSystemAccount: true,
      karma: 0,
    });
    console.log(`✅ System user "${NEO_USERNAME}" created`);
  }

  await mongoose.disconnect();
  console.log('👋 Disconnected from MongoDB');
}

seedNeoUser().catch(async (err) => {
  console.error('❌ Failed to seed Neo user:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
