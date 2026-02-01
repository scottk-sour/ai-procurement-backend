/**
 * Clean Orphaned Products Script
 * Deletes VendorProduct records where vendorId doesn't match any existing Vendor
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function cleanOrphanedProducts() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected\n');

  // Define models
  const Vendor = mongoose.model('Vendor', new mongoose.Schema({}, { strict: false }), 'vendors');
  const VendorProduct = mongoose.model('VendorProduct', new mongoose.Schema({}, { strict: false }), 'vendorproducts');

  // Get all valid vendor IDs
  const vendors = await Vendor.find({}, { _id: 1 });
  const validVendorIds = new Set(vendors.map(v => v._id.toString()));

  console.log('Valid vendor count:', validVendorIds.size);

  // Find all products
  const allProducts = await VendorProduct.find({}, { vendorId: 1, name: 1 });
  console.log('Total products:', allProducts.length);

  // Find orphaned products
  const orphanedProducts = allProducts.filter(product => {
    const vendorIdStr = product.vendorId?.toString();
    return !vendorIdStr || !validVendorIds.has(vendorIdStr);
  });

  console.log('Orphaned products found:', orphanedProducts.length);

  if (orphanedProducts.length > 0) {
    console.log('\nDeleting orphaned products...');

    const orphanedIds = orphanedProducts.map(p => p._id);
    const result = await VendorProduct.deleteMany({ _id: { $in: orphanedIds } });

    console.log('✓ Deleted:', result.deletedCount, 'orphaned products');
  } else {
    console.log('No orphaned products to delete.');
  }

  const remainingProducts = await VendorProduct.countDocuments();
  console.log('\nRemaining products:', remainingProducts);

  await mongoose.disconnect();
  console.log('✓ Disconnected');
}

cleanOrphanedProducts().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
