import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';

// Fix dotenv path for monorepo
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Post from '../models/Post.js';
import PostEmbedding from '../models/PostEmbedding.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });

async function embedText(text) {
  const result = await embeddingModel.embedContent(text);
  return result.embedding.values; // 768-dim array
}

async function backfill() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to Atlas');

  const posts = await Post.find({}).lean();
  console.log(`Found ${posts.length} posts to embed`);

  const BATCH_SIZE = 5; // Small batch — free Gemini tier has rate limits
  
  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);
    
    await Promise.all(
      batch.map(async (post) => {
        try {
          // Skip if already embedded
          const exists = await PostEmbedding.findOne({ postId: post._id });
          if (exists) {
            console.log(`  ⏭ Skipping post ${post._id} (already embedded)`);
            return;
          }

          const text = `${post.title} ${post.body || ''}`.trim().slice(0, 2000);
          const embedding = await embedText(text);

          await PostEmbedding.create({
            postId: post._id,
            communityId: post.community,
            type: 'post',
            text,
            embedding,
          });

          console.log(`  ✅ Embedded: "${post.title.slice(0, 50)}"`);
        } catch (err) {
          console.error(`  ❌ Failed for post ${post._id}:`, err.message);
        }
      })
    );

    // Rate limit breathing room — Gemini free tier: 15 RPM
    if (i + BATCH_SIZE < posts.length) {
      console.log(`  ⏳ Waiting 4s before next batch...`);
      await new Promise((r) => setTimeout(r, 4000));
    }
  }

  console.log('✅ Backfill complete');
  await mongoose.disconnect();
}

backfill().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});