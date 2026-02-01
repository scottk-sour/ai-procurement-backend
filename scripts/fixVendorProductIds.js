/**
 * Fix VendorProduct vendorId fields
 * Converts string vendorIds to ObjectIds
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function fixVendorProductIds() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('vendorproducts');

    // Find all products where vendorId is a string (not ObjectId)
    const products = await collection.find({}).toArray();
    console.log(`\nFound ${products.length} total products`);

    let fixedCount = 0;
    for (const product of products) {
      const vendorId = product.vendorId;

      // Check if vendorId is a string that should be an ObjectId
      if (typeof vendorId === 'string' && mongoose.Types.ObjectId.isValid(vendorId)) {
        console.log(`Fixing product ${product._id}: vendorId "${vendorId}" -> ObjectId`);

        await collection.updateOne(
          { _id: product._id },
          { $set: { vendorId: new mongoose.Types.ObjectId(vendorId) } }
        );
        fixedCount++;
      } else if (vendorId instanceof mongoose.Types.ObjectId || (vendorId && vendorId._bsontype === 'ObjectId')) {
        console.log(`Product ${product._id}: vendorId is already ObjectId`);
      } else {
        console.log(`Product ${product._id}: vendorId type is ${typeof vendorId}`);
      }
    }

    console.log(`\nFixed ${fixedCount} products`);

    // Verify the demo vendor's products
    const demoVendorId = new mongoose.Types.ObjectId('697e212e7df418c53adbfafc');
    const demoProducts = await collection.find({ vendorId: demoVendorId }).toArray();
    console.log(`\nDemo vendor (697e212e7df418c53adbfafc) now has ${demoProducts.length} products:`);
    demoProducts.forEach(p => {
      console.log(`  - ${p.manufacturer} ${p.model}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

fixVendorProductIds();
