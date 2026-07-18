import 'dotenv/config';
import mongoose from 'mongoose';

async function createIndexes() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Text search index for admin user search
  await mongoose.connection.db.collection('users').createIndex(
    { username: 'text', email: 'text' },
    { background: true }
  );
  console.log('✅ users text index created (username + email)');

  await mongoose.disconnect();
  console.log('Done');
}

createIndexes().catch((err) => {
  console.error('Index creation failed:', err);
  process.exit(1);
});
