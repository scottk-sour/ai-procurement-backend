import mongoose from 'mongoose';
import RefreshToken from '../../models/RefreshToken.js';
import logger from '../../services/logger.js';
import config from '../../config/env.js';

async function cleanupExpiredTokens() {
  try {
    await mongoose.connect(config.database.url);
    logger.info('Connected to database for token cleanup');

    const result = await RefreshToken.deleteMany({
      expiresAt: { $lt: new Date() }
    });

    logger.info(Cleanup complete: Deleted ${result.deletedCount} expired tokens);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    logger.error('Cleanup failed', { error: error.message });
    process.exit(1);
  }
}

cleanupExpiredTokens();
