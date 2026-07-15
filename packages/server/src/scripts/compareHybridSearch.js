import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Community from '../models/Community.js';
import PostEmbedding from '../models/PostEmbedding.js';
import { buildVectorSearchPipeline } from '../utils/vectorSearch.js';
import { hybridSearch, pureVectorSearch } from '../services/hybridSearchService.js';
import { HYBRID_SEARCH_QUERIES } from './fixtures/hybridSearchQueries.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });

async function embedQuery(queryText) {
  const result = await embeddingModel.embedContent({
    content: { parts: [{ text: queryText }] },
    outputDimensionality: 768,
  });
  return result.embedding.values;
}

function printResults(label, results) {
  console.log(`  ${label}:`);
  results.forEach((result, index) => {
    const doc = result.doc || result;
    const title = doc.text || doc.title || doc.body || doc.postId || doc.commentId || 'untitled';
    console.log(`    ${index + 1}. ${String(title).slice(0, 120)}`);
  });
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  for (const fixture of HYBRID_SEARCH_QUERIES) {
    const community = await Community.findOne({ slug: fixture.communitySlug }).select('_id slug name').lean();
    if (!community) {
      console.log(`\n⚠️  Skipping ${fixture.queryText} — community ${fixture.communitySlug} not found`);
      continue;
    }

    const queryEmbedding = await embedQuery(fixture.queryText);

    const [pureVectorResults, hybridResults] = await Promise.all([
      pureVectorSearch(queryEmbedding, community._id, 8),
      hybridSearch(fixture.queryText, queryEmbedding, community._id, 8),
    ]);

    console.log(`\n🔎 ${fixture.communitySlug} :: ${fixture.queryText}`);
    printResults('Pure vector', pureVectorResults);
    printResults('Hybrid', hybridResults);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Hybrid search comparison failed:', err);
  process.exit(1);
});