import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);

const productVendorIds = await mongoose.connection.db.collection('vendorproducts').distinct('vendorId');
const vendors = await mongoose.connection.db.collection('vendors').find({}).toArray();

console.log('Vendor IDs in products:', productVendorIds.length);
console.log('Total vendors:', vendors.length);

console.log('\nMatching vendors to products:');
for (const vid of productVendorIds) {
  const vendor = vendors.find(v => v._id.toString() === vid.toString());
  if (vendor) {
    console.log('✅', vid.toString(), '->', vendor.name);
  } else {
    console.log('❌', vid.toString(), '-> NOT FOUND');
  }
}
process.exit(0);
