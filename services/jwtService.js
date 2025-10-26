import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import config from '../config/env.js';
import RefreshToken from '../models/RefreshToken.js';
import logger from './logger.js';

class JWTService {
  /**
   * Generate access token (short-lived)
   */
  static generateAccessToken(payload) {
    const { secret, expiresIn } = config.jwt;

    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    return jwt.sign(payload, secret, { expiresIn });
  }

  /**
   * Generate refresh token (long-lived)
   */
  static async generateRefreshToken(userId, vendorId, userType, ipAddress) {
    const { refreshSecret, refreshExpiresIn } = config.jwt;

    if (!refreshSecret) {
      throw new Error('JWT_REFRESH_SECRET is not configured');
    }

    // Generate secure random token
    const token = crypto.randomBytes(40).toString('hex');

    // Calculate expiry (convert "7d" to milliseconds)
    const expiryMs = this.parseExpiry(refreshExpiresIn);
    const expiresAt = new Date(Date.now() + expiryMs);

    // Save to database
    const refreshToken = new RefreshToken({
      token,
      userId: userId || null,
      vendorId: vendorId || null,
      userType,
      expiresAt,
      createdByIp: ipAddress
    });

    await refreshToken.save();

    logger.info('Refresh token generated', {
      userType,
      userId: userId || vendorId,
      expiresAt,
      ipAddress
    });

    return token;
  }

  /**
   * Verify access token
   */
  static verifyAccessToken(token) {
    try {
      const { secret } = config.jwt;

      if (!secret) {
        throw new Error('JWT_SECRET is not configured');
      }

      const decoded = jwt.verify(token, secret);
      return { valid: true, decoded };
    } catch (error) {
      logger.warn('Access token verification failed', { error: error.message });
      return { valid: false, error: error.message };
    }
  }

  /**
   * Verify refresh token
   */
  static async verifyRefreshToken(token, ipAddress) {
    try {
      // Find token in database
      const refreshToken = await RefreshToken.findOne({ token });

      if (!refreshToken) {
        logger.warn('Refresh token not found in database', { ipAddress });
        throw new Error('Invalid refresh token');
      }

      // Check if revoked
      if (refreshToken.revoked) {
        logger.warn('Attempted to use revoked refresh token', {
          userId: refreshToken.userId || refreshToken.vendorId,
          ipAddress,
          revokedAt: refreshToken.revokedAt,
          revokedReason: refreshToken.revokedReason
        });
        throw new Error('Refresh token has been revoked');
      }

      // Check if expired
      if (refreshToken.isExpired()) {
        logger.warn('Refresh token expired', {
          userId: refreshToken.userId || refreshToken.vendorId,
          expiresAt: refreshToken.expiresAt,
          ipAddress
        });
        throw new Error('Refresh token expired');
      }

      logger.info('Refresh token verified successfully', {
        userId: refreshToken.userId || refreshToken.vendorId,
        userType: refreshToken.userType,
        ipAddress
      });

      return refreshToken;
    } catch (error) {
      logger.error('Refresh token verification error', {
        error: error.message,
        ipAddress
      });
      throw error;
    }
  }

  /**
   * Rotate refresh token (revoke old, generate new)
   */
  static async rotateRefreshToken(oldToken, ipAddress) {
    try {
      // Verify old token
      const oldRefreshToken = await this.verifyRefreshToken(oldToken, ipAddress);

      // Generate new refresh token
      const newToken = await this.generateRefreshToken(
        oldRefreshToken.userId,
        oldRefreshToken.vendorId,
        oldRefreshToken.userType,
        ipAddress
      );

      // Revoke old token and link to new one
      oldRefreshToken.revoked = true;
      oldRefreshToken.revokedAt = Date.now();
      oldRefreshToken.revokedByIp = ipAddress;
      oldRefreshToken.revokedReason = 'Replaced by rotation';
      oldRefreshToken.replacedByToken = newToken;
      await oldRefreshToken.save();

      logger.info('Refresh token rotated', {
        userId: oldRefreshToken.userId || oldRefreshToken.vendorId,
        userType: oldRefreshToken.userType,
        ipAddress
      });

      return {
        refreshToken: oldRefreshToken,
        newToken
      };
    } catch (error) {
      logger.error('Token rotation failed', {
        error: error.message,
        ipAddress
      });
      throw error;
    }
  }

  /**
   * Revoke refresh token
   */
  static async revokeRefreshToken(token, ipAddress, reason = 'User logout') {
    try {
      await RefreshToken.revokeToken(token, ipAddress, reason);

      logger.info('Refresh token revoked', {
        reason,
        ipAddress
      });
    } catch (error) {
      logger.error('Token revocation failed', {
        error: error.message,
        ipAddress
      });
      throw error;
    }
  }

  /**
   * Revoke all tokens for a user
   */
  static async revokeAllUserTokens(userId, ipAddress, reason = 'Revoke all sessions') {
    try {
      const result = await RefreshToken.revokeAllUserTokens(userId, ipAddress, reason);

      logger.info('All user tokens revoked', {
        userId,
        count: result.modifiedCount,
        reason,
        ipAddress
      });

      return result;
    } catch (error) {
      logger.error('Revoke all user tokens failed', {
        userId,
        error: error.message,
        ipAddress
      });
      throw error;
    }
  }

  /**
   * Revoke all tokens for a vendor
   */
  static async revokeAllVendorTokens(vendorId, ipAddress, reason = 'Revoke all sessions') {
    try {
      const result = await RefreshToken.revokeAllVendorTokens(vendorId, ipAddress, reason);

      logger.info('All vendor tokens revoked', {
        vendorId,
        count: result.modifiedCount,
        reason,
        ipAddress
      });

      return result;
    } catch (error) {
      logger.error('Revoke all vendor tokens failed', {
        vendorId,
        error: error.message,
        ipAddress
      });
      throw error;
    }
  }

  /**
   * Helper: Parse expiry string to milliseconds
   */
  static parseExpiry(expiryStr) {
    const units = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000
    };

    const match = expiryStr.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(Invalid expiry format: ${expiryStr});
    }

    const [, value, unit] = match;
    return parseInt(value) * units[unit];
  }

  /**
   * Cleanup expired tokens (should be run periodically)
   */
  static async cleanupExpiredTokens() {
    try {
      const deletedCount = await RefreshToken.cleanupExpiredTokens();

      logger.info('Cleanup expired refresh tokens', {
        deletedCount
      });

      return deletedCount;
    } catch (error) {
      logger.error('Cleanup expired tokens failed', {
        error: error.message
      });
      throw error;
    }
  }
}

export default JWTService;
