import mongoose from 'mongoose';
import logger from '../services/logger.js';

/**
 * Database Performance Monitoring Utility
 * Tracks connection pool status, query performance, and database health
 */

class DatabaseMonitor {
  constructor() {
    this.queryStats = {
      total: 0,
      slow: 0,
      failed: 0
    };
    this.slowQueryThreshold = 100; // milliseconds
  }

  /**
   * Get current connection pool status
   */
  getPoolStatus() {
    const db = mongoose.connection;
    
    if (db.readyState !== 1) {
      return {
        connected: false,
        status: this.getReadyStateLabel(db.readyState)
      };
    }

    return {
      connected: true,
      status: 'Connected',
      database: db.name,
      host: db.host,
      port: db.port,
      readyState: this.getReadyStateLabel(db.readyState),
      collections: Object.keys(db.collections).length
    };
  }

  /**
   * Get readable connection state
   */
  getReadyStateLabel(state) {
    const states = {
      0: 'Disconnected',
      1: 'Connected',
      2: 'Connecting',
      3: 'Disconnecting'
    };
    return states[state] || 'Unknown';
  }

  /**
   * Monitor slow queries
   */
  enableSlowQueryLogging() {
    mongoose.set('debug', (collectionName, method, query, doc) => {
      const start = Date.now();
      
      // Log after query completes
      setImmediate(() => {
        const duration = Date.now() - start;
        
        this.queryStats.total++;
        
        if (duration > this.slowQueryThreshold) {
          this.queryStats.slow++;
          logger.warn('Slow query detected', {
            collection: collectionName,
            method,
            query: JSON.stringify(query),
            duration: `${duration}ms`
          });
        }
      });
    });
    
    logger.info('Slow query logging enabled');
  }

  /**
   * Get query statistics
   */
  getQueryStats() {
    return {
      ...this.queryStats,
      slowQueryPercentage: this.queryStats.total > 0 
        ? ((this.queryStats.slow / this.queryStats.total) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Check database health
   */
  async checkHealth() {
    try {
      const db = mongoose.connection;
      
      if (db.readyState !== 1) {
        return {
          healthy: false,
          reason: 'Database not connected'
        };
      }

      // Ping database
      await db.db.admin().ping();

      // Get server status
      const serverStatus = await db.db.admin().serverStatus();

      return {
        healthy: true,
        uptime: serverStatus.uptime,
        connections: {
          current: serverStatus.connections.current,
          available: serverStatus.connections.available,
          utilization: ((serverStatus.connections.current / (serverStatus.connections.current + serverStatus.connections.available)) * 100).toFixed(2) + '%'
        },
        memory: {
          resident: (serverStatus.mem.resident / 1024).toFixed(2) + ' GB',
          virtual: (serverStatus.mem.virtual / 1024).toFixed(2) + ' GB'
        },
        operations: {
          inserts: serverStatus.opcounters.insert,
          queries: serverStatus.opcounters.query,
          updates: serverStatus.opcounters.update,
          deletes: serverStatus.opcounters.delete
        }
      };
    } catch (error) {
      logger.error('Health check failed', { error: error.message });
      return {
        healthy: false,
        reason: error.message
      };
    }
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats(collectionName) {
    try {
      const db = mongoose.connection;
      const stats = await db.db.collection(collectionName).stats();

      return {
        collection: collectionName,
        documents: stats.count,
        size: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
        storageSize: (stats.storageSize / 1024 / 1024).toFixed(2) + ' MB',
        indexes: stats.nindexes,
        indexSize: (stats.totalIndexSize / 1024 / 1024).toFixed(2) + ' MB',
        avgDocSize: (stats.avgObjSize / 1024).toFixed(2) + ' KB'
      };
    } catch (error) {
      logger.error('Failed to get collection stats', {
        collection: collectionName,
        error: error.message
      });
      return null;
    }
  }

  /**
   * List all indexes for a collection
   */
  async listIndexes(collectionName) {
    try {
      const db = mongoose.connection;
      const indexes = await db.db.collection(collectionName).indexes();

      return indexes.map(index => ({
        name: index.name,
        keys: index.key,
        unique: index.unique || false,
        sparse: index.sparse || false
      }));
    } catch (error) {
      logger.error('Failed to list indexes', {
        collection: collectionName,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Generate performance report
   */
  async generateReport() {
    const poolStatus = this.getPoolStatus();
    const queryStats = this.getQueryStats();
    const health = await this.checkHealth();

    const report = {
      timestamp: new Date().toISOString(),
      connection: poolStatus,
      queryPerformance: queryStats,
      databaseHealth: health
    };

    logger.info('Database performance report', report);

    return report;
  }
}

// Export singleton instance
const dbMonitor = new DatabaseMonitor();

export default dbMonitor;
