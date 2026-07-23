import mongoose from 'mongoose';
await mongoose.connect('mongodb://anuradhaavits_db_user:Helloiamanuradha@ac-utgud6a-shard-00-00.k8jx2ke.mongodb.net:27017/threadverse?ssl=true&authSource=admin');
const r = await mongoose.connection.db.collection('postembeddings').aggregate([
  { $group: { _id: '$communityId', count: { $sum: 1 } } },
  { $sort: { count: -1 } }
]).toArray();
console.log('Embeddings per community:');
r.forEach(c => console.log(`  ${c._id}: ${c.count}`));
console.log(`Total: ${r.reduce((s,c) => s+c.count, 0)}`);
await mongoose.disconnect();
