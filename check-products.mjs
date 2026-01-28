import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);
const products = await mongoose.connection.db.collection('products').find({}).limit(5).toArray();
console.log('Sample products:');
products.forEach(p => console.log(p.manufacturer, p.model, '-> vendorId:', p.vendorId));
process.exit(0);
