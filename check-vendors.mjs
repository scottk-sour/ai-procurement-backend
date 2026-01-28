import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const vendorSchema = new mongoose.Schema({}, { strict: false });
const productSchema = new mongoose.Schema({}, { strict: false });

await mongoose.connect(process.env.MONGODB_URI);

const Vendor = mongoose.model('Vendor', vendorSchema);
const Product = mongoose.model('Product', productSchema);

const vendors = await Vendor.find({}).select('name email');
const products = await Product.aggregate([
  { $group: { _id: '$vendorId', count: { $sum: 1 } } }
]);

console.log('Vendors:', vendors.length);
vendors.forEach(v => console.log(' -', v.name, v.email));
console.log('\nProducts per vendor:');
products.forEach(p => console.log(' -', p._id, ':', p.count, 'products'));

process.exit(0);
