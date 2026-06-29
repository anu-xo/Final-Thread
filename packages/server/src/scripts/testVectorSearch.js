import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import PostEmbedding from '../models/PostEmbedding.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function testSearch(queryText, communityId) {
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  const result = await model.embedContent(queryText);
  const queryVector = result.embedding.values;

  const results = await PostEmbedding.aggregate([
    {
      $vectorSearch: {
        index: 'postembeddings_vector_index',
        path: 'embedding',
        queryVector,
        numCandidates: 50,
        limit: 8,
        filter: { communityId: new mongoose.Types.ObjectId(communityId) },
      },
    },
    {
      $project: {
        postId: 1,
        text: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ]);

  console.log(`\n🔍 Query: "${queryText}"`);
  console.log(`📊 Top ${results.length} results:`);
  results.forEach((r, i) => {
    console.log(`  ${i + 1}. [${r.score.toFixed(4)}] ${r.text.slice(0, 80)}...`);
  });
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  // Grab a real communityId from your DB
  const sample = await PostEmbedding.findOne().lean();
  if (!sample) {
    console.log('No embeddings found. Run backfill first.');
    process.exit(0);
  }

  await testSearch('best practices for React hooks', sample.communityId.toString());
  
  await mongoose.disconnect();
}

main().catch(console.error);