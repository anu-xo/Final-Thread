import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import PostEmbedding from '../models/PostEmbedding.js';
import { buildVectorSearchPipeline } from '../utils/vectorSearch.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function testSearch(queryText, communityId, type) {
  const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
  const result = await model.embedContent({
    content: { parts: [{ text: queryText }] },
    outputDimensionality: 768,
  });
  const queryVector = result.embedding.values;

  const results = await PostEmbedding.aggregate(buildVectorSearchPipeline({
    queryVector,
    communityId: new mongoose.Types.ObjectId(communityId),
    type,
  }));

  console.log(`\n🔍 Query: "${queryText}" (${type})`);
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

  await testSearch('best practices for React hooks', sample.communityId.toString(), 'post');
  await testSearch('helpful feedback on the feature', sample.communityId.toString(), 'comment');

  await mongoose.disconnect();
}

main().catch(console.error);