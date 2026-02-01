/**
 * Fix VendorProduct status fields
 * Sets status: 'active' on all products that don't have a status field
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function fixProductStatus() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('vendorproducts');

    // Update all products without a status field to have status: 'active'
    const result = await collection.updateMany(
      { status: { $exists: false } },
      { $set: { status: 'active', isActive: true } }
    );

    console.log(`\nUpdated ${result.modifiedCount} products with status: 'active'`);

    // Verify demo vendor's products
    const demoVendorId = new mongoose.Types.ObjectId('697e212e7df418c53adbfafc');
    const demoProducts = await collection.find({ vendorId: demoVendorId }).toArray();

    console.log(`\nDemo vendor products (${demoProducts.length}):`);
    demoProducts.forEach(p => {
      console.log(`  - ${p.manufacturer} ${p.model}: status=${p.status}, isActive=${p.isActive}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

fixProductStatus();
