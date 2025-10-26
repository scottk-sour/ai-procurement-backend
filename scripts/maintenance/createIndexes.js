import mongoose from 'mongoose';
import config from '../../config/env.js';
import logger from '../../services/logger.js';

/**
 * Index Management Script
 * Creates compound indexes for optimal query performance
 */

async function createIndexes() {
  try {
    await mongoose.connect(config.database.uri, config.database.options);
    logger.info('Connected to MongoDB for index creation');

    const db = mongoose.connection.db;

    // VendorProduct compound indexes for common queries
    logger.info('Creating VendorProduct indexes...');
    await db.collection('vendorproducts').createIndex(
      { vendorId: 1, 'availability.inStock': 1 },
      { name: 'vendor_availability_idx' }
    );
    await db.collection('vendorproducts').createIndex(
      { minVolume: 1, maxVolume: 1, 'costs.totalMachineCost': 1 },
      { name: 'volume_cost_idx' }
    );
    await db.collection('vendorproducts').createIndex(
      { category: 1, speed: 1, 'costs.totalMachineCost': 1 },
      { name: 'category_speed_cost_idx' }
    );

    // Quote/QuoteRequest compound indexes
    logger.info('Creating Quote indexes...');
    await db.collection('copierquoterequests').createIndex(
      { userId: 1, status: 1, createdAt: -1 },
      { name: 'user_status_date_idx' }
    );
    await db.collection('copierquoterequests').createIndex(
      { status: 1, 'monthlyVolume.total': 1 },
      { name: 'status_volume_idx' }
    );

    // Vendor compound indexes
    logger.info('Creating Vendor indexes...');
    await db.collection('vendors').createIndex(
      { 'account.status': 1, 'performance.rating': -1 },
      { name: 'status_rating_idx' }
    );
    await db.collection('vendors').createIndex(
      { services: 1, 'account.status': 1 },
      { name: 'services_status_idx' }
    );

    // VendorActivity compound indexes
    logger.info('Creating VendorActivity indexes...');
    await db.collection('vendoractivities').createIndex(
      { vendorId: 1, date: -1 },
      { name: 'vendor_date_idx' }
    );
    await db.collection('vendoractivities').createIndex(
      { vendorId: 1, category: 1, date: -1 },
      { name: 'vendor_category_date_idx' }
    );

    // RefreshToken indexes (Day 3)
    logger.info('Creating RefreshToken indexes...');
    await db.collection('refreshtokens').createIndex(
      { token: 1 },
      { name: 'token_idx', unique: true }
    );
    await db.collection('refreshtokens').createIndex(
      { userId: 1, revoked: 1 },
      { name: 'user_revoked_idx' }
    );
    await db.collection('refreshtokens').createIndex(
      { vendorId: 1, revoked: 1 },
      { name: 'vendor_revoked_idx' }
    );
    await db.collection('refreshtokens').createIndex(
      { expiresAt: 1 },
      { name: 'expires_ttl_idx', expireAfterSeconds: 0 }
    );

    // User compound indexes
    logger.info('Creating User indexes...');
    await db.collection('users').createIndex(
      { email: 1 },
      { name: 'email_unique_idx', unique: true }
    );
    await db.collection('users').createIndex(
      { role: 1, isActive: 1 },
      { name: 'role_active_idx' }
    );

    logger.info('✅ All indexes created successfully');

    // List all collections and their indexes
    const collections = await db.listCollections().toArray();
    for (const col of collections) {
      const indexes = await db.collection(col.name).indexes();
      logger.info(`Collection: ${col.name}`, {
        indexCount: indexes.length,
        indexes: indexes.map(i => i.name)
      });
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    logger.error('Index creation failed', { error: error.message });
    process.exit(1);
  }
}

createIndexes();
