import mongoose from 'mongoose';
await mongoose.connect('mongodb://anuradhaavits_db_user:Helloiamanuradha@ac-utgud6a-shard-00-00.k8jx2ke.mongodb.net:27017/threadverse?ssl=true&authSource=admin');
const r = await mongoose.connection.db.collection('communities').find({}).project({ name: 1, slug: 1 }).toArray();
r.forEach(c => console.log(`${c._id} | ${c.name} | ${c.slug}`));
await mongoose.disconnect();
