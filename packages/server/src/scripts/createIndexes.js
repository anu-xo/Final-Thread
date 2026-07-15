import 'dotenv/config';
import mongoose from 'mongoose';

async function main() {
  console.log('⏳ Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const collection = mongoose.connection.db.collection('postembeddings');

  // 1. Create Vector Search Index
  console.log('⏳ Creating Vector Search Index: "post_embedding_vector_index"...');
  try {
    await collection.createSearchIndex({
      name: 'post_embedding_vector_index',
      type: 'vectorSearch',
      definition: {
        fields: [
          {
            type: 'vector',
            path: 'embedding',
            numDimensions: 768,
            similarity: 'cosine'
          },
          {
            type: 'filter',
            path: 'communityId'
          },
          {
            type: 'filter',
            path: 'type'
          }
        ]
      }
    });
    console.log('✅ Vector Search Index creation request submitted successfully.');
  } catch (err) {
    console.error('❌ Failed to create Vector Search Index:', err.message);
  }

  // 2. Create Full-Text Search Index
  console.log('⏳ Creating Text Search Index: "postembeddings_text_index"...');
  try {
    await collection.createSearchIndex({
      name: 'postembeddings_text_index',
      definition: {
        mappings: {
          dynamic: true
        }
      }
    });
    console.log('✅ Text Search Index creation request submitted successfully.');
  } catch (err) {
    console.error('❌ Failed to create Text Search Index:', err.message);
  }

  console.log('⏳ Disconnecting...');
  await mongoose.disconnect();
  console.log('👋 Done.');
}

main().catch(console.error);
