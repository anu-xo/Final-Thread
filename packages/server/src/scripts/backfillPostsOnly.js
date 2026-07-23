// packages/server/src/scripts/backfillPostsOnly.js
// Fast backfill: posts only, shorter delays, for the 5 live communities.
// Skips already-embedded docs. ~1000 posts at batch-10 / 1.5s delay ≈ 2.5 min.

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Post from '../models/Post.js';
import PostEmbedding from '../models/PostEmbedding.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });

const BATCH_SIZE = 10;
const DELAY_MS = 1500;

async function embedText(text) {
  const result = await embeddingModel.embedContent({
    content: { parts: [{ text }] },
    outputDimensionality: 768,
  });
  return result.embedding.values;
}

async function backfill() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to Atlas');

  const posts = await Post.find({ isDeleted: false, isRemoved: false })
    .select('title body community')
    .lean();
  console.log(`Found ${posts.length} posts to embed`);

  let embedded = 0, skipped = 0, failed = 0;

  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (post) => {
        try {
          const exists = await PostEmbedding.findOne({ postId: post._id });
          if (exists) { skipped++; return; }

          const text = `${post.title} ${post.body || ''}`.trim().slice(0, 2000);
          const embedding = await embedText(text);

          await PostEmbedding.create({
            postId: post._id,
            communityId: post.community,
            type: 'post',
            text,
            embedding,
          });
          embedded++;
        } catch (err) {
          failed++;
          console.error(`  Failed ${post._id}: ${err.message}`);
        }
      })
    );

    const pct = Math.min(100, Math.round(((i + BATCH_SIZE) / posts.length) * 100));
    console.log(`  [${pct}%] embedded=${embedded} skipped=${skipped} failed=${failed}`);

    if (i + BATCH_SIZE < posts.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\nDone. embedded=${embedded} skipped=${skipped} failed=${failed}`);
  await mongoose.disconnect();
}

backfill().catch((err) => { console.error('Fatal:', err); process.exit(1); });
