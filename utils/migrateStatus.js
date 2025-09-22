import mongoose from 'mongoose';
import Vendor from './models/Vendor.js'; // Adjust the path as needed

const MONGODB_URI = 'YOUR_MONGODB_URI';

const migrateVendorStatus = async () => {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB.');

    // Find all vendors with the old top-level 'status' field
    const vendorsToMigrate = await Vendor.find({
      status: { $exists: true }
    });

    if (vendorsToMigrate.length === 0) {
      console.log('⏭️ No vendors found with the old status field. Migration not needed.');
      return;
    }

    console.log(`🔍 Found ${vendorsToMigrate.length} vendors to migrate.`);

    for (const vendor of vendorsToMigrate) {
      console.log(`🔄 Migrating vendor: ${vendor.email}`);
      
      // Get the current status
      const currentStatus = vendor.status;

      // Update the document to set the new account.status and remove the old field
      await Vendor.updateOne(
        { _id: vendor._id },
        {
          $set: { 'account.status': currentStatus },
          $unset: { status: '' }
        }
      );
    }

    console.log('🎉 Migration complete!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🚪 Disconnected from MongoDB.');
  }
};

migrateVendorStatus();
