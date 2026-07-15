import 'dotenv/config';
import mongoose from 'mongoose';
import PostEmbedding from '../models/PostEmbedding.js';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  // List collections
  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log('Collections in database:', collections.map(c => c.name));
  
  // Check if postembeddings has search indexes
  try {
    const indexes = await mongoose.connection.db.collection('postembeddings').listSearchIndexes().toArray();
    console.log('Search indexes on postembeddings:', JSON.stringify(indexes, null, 2));
  } catch (err) {
    console.log('Failed to list search indexes:', err.message);
  }

  const sample = await PostEmbedding.findOne().lean();
  if (!sample) {
    console.log('No embeddings found in database.');
    await mongoose.disconnect();
    return;
  }

  console.log('Sample communityId:', sample.communityId);
  console.log('Sample type:', sample.type);
  console.log('Embedding values length:', sample.embedding.length);

  const testIndexes = ['post_embedding_vector_index', 'postembeddings_vector_index', 'vector_index'];
  
  for (const index of testIndexes) {
    try {
      const results = await PostEmbedding.aggregate([
        {
          $vectorSearch: {
            index,
            path: 'embedding',
            queryVector: sample.embedding,
            numCandidates: 10,
            limit: 3
          }
        }
      ]);
      console.log(`Index [${index}] SUCCESS: found ${results.length} results`);
    } catch (err) {
      console.log(`Index [${index}] FAILED:`, err.message);
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
