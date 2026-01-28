import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);
const collections = await mongoose.connection.db.listCollections().toArray();
console.log('Collections:');
collections.forEach(c => console.log(' -', c.name));

for (const c of collections) {
  const count = await mongoose.connection.db.collection(c.name).countDocuments();
  console.log(c.name + ':', count);
}
process.exit(0);
