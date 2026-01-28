import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);

const products = await mongoose.connection.db.collection('vendorproducts').find({
  volumeRange: '6k-13k'
}).toArray();

const byVendor = {};
products.forEach(p => {
  const vid = p.vendorId.toString();
  if (!byVendor[vid]) byVendor[vid] = [];
  byVendor[vid].push(p.manufacturer + ' ' + p.model);
});

console.log('Products in 6k-13k range by vendor:');
for (const [vid, prods] of Object.entries(byVendor)) {
  console.log('\nVendor', vid, '(' + prods.length + ' products):');
  prods.slice(0,3).forEach(p => console.log('  -', p));
}
process.exit(0);
