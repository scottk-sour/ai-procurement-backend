import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);
const products = await mongoose.connection.db.collection('vendorproducts').find({}).limit(5).toArray();
console.log('Sample vendorproducts:');
products.forEach(p => console.log(p.manufacturer, p.model, '-> vendorId:', p.vendorId));

const vendorIds = await mongoose.connection.db.collection('vendorproducts').distinct('vendorId');
console.log('\nUnique vendorIds:', vendorIds.length);
vendorIds.slice(0,5).forEach(v => console.log(' -', v));
process.exit(0);
