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
import Comment from '../models/Comment.js';
import PostEmbedding from '../models/PostEmbedding.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });

async function embedText(text) {
  const result = await embeddingModel.embedContent({
    content: { parts: [{ text }] },
    outputDimensionality: 768,
  });
  return result.embedding.values; // 768-dim array
}

async function backfill() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to Atlas');

  const posts = await Post.find({}).lean();
  const comments = await Comment.find({}).lean();
  console.log(`Found ${posts.length} posts and ${comments.length} comments to embed`);

  const BATCH_SIZE = 5; // Small batch — free Gemini tier has rate limits

  const processItems = async (items, type, label) => {
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (item) => {
          try {
            const exists = type === 'comment'
              ? await PostEmbedding.findOne({ commentId: item._id })
              : await PostEmbedding.findOne({ postId: item._id });

            if (exists) {
              console.log(`  ⏭ Skipping ${label} ${item._id} (already embedded)`);
              return;
            }

            const text = type === 'comment'
              ? item.body?.trim().slice(0, 2000)
              : `${item.title} ${item.body || ''}`.trim().slice(0, 2000);

            const communityId = type === 'comment'
              ? (await Post.findById(item.post).select('community').lean())?.community
              : item.community;

            const embedding = await embedText(text);

            await PostEmbedding.create({
              postId: type === 'comment' ? item.post : item._id,
              commentId: type === 'comment' ? item._id : undefined,
              communityId,
              type,
              text,
              embedding,
            });

            console.log(`  ✅ Embedded ${label}: "${String(item.title || item.body || item._id).slice(0, 50)}"`);
          } catch (err) {
            console.error(`  ❌ Failed for ${label} ${item._id}:`, err.message);
          }
        })
      );

      if (i + BATCH_SIZE < items.length) {
        console.log(`  ⏳ Waiting 4s before next batch...`);
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
  };

  await processItems(posts, 'post', 'post');
  await processItems(comments, 'comment', 'comment');

  console.log('✅ Backfill complete');
  await mongoose.disconnect();
}

backfill().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});