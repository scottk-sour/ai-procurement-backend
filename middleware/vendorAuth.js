import jwt from 'jsonwebtoken';
import Vendor from '../models/Vendor.js';

/**
 * Production-level vendor authentication middleware
 * Verifies JWT tokens, validates vendor accounts, and enforces security policies
 */

// Environment validation - fail fast if JWT_SECRET is missing
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET environment variable is required for secure operation');
  process.exit(1);
}

// Token extraction utility
const extractToken = (req) => {
  const authHeader = req.headers.authorization;
  
  // Support multiple token formats for flexibility
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Fallback to custom header (for API clients)
  const customToken = req.headers['x-vendor-token'];
  if (customToken) {
    return customToken;
  }
  
  return null;
};

/**
 * Main vendor authentication middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const vendorAuth = async (req, res, next) => {
  try {
    // Extract token from request
    const token = extractToken(req);
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Access denied. Valid authentication token required.',
        code: 'AUTH_001'
      });
    }

    // Verify and decode JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      console.warn('🔒 Invalid vendor token attempt:', {
        error: jwtError.name,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });

      const errorResponse = {
        success: false,
        error: 'INVALID_TOKEN',
        code: 'AUTH_002'
      };

      if (jwtError.name === 'TokenExpiredError') {
        errorResponse.message = 'Authentication token has expired. Please log in again.';
        errorResponse.code = 'AUTH_003';
      } else if (jwtError.name === 'JsonWebTokenError') {
        errorResponse.message = 'Invalid authentication token format.';
      } else {
        errorResponse.message = 'Token verification failed.';
      }

      return res.status(401).json(errorResponse);
    }

    // Validate token structure
    const vendorId = decoded.vendorId;
    if (!vendorId) {
      console.warn('🔒 Token missing vendorId:', {
        tokenPayload: decoded,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      return res.status(401).json({ 
        success: false,
        error: 'INVALID_TOKEN_STRUCTURE',
        message: 'Authentication token is malformed.',
        code: 'AUTH_004'
      });
    }

    // Fetch vendor from database with error handling
    let vendor;
    try {
      vendor = await Vendor.findById(vendorId)
        .select('-password -__v -resetPasswordToken -resetPasswordExpires')
        .lean();
    } catch (dbError) {
      console.error('❌ Database error during vendor lookup:', {
        vendorId,
        error: dbError.message,
        stack: dbError.stack
      });

      return res.status(500).json({ 
        success: false,
        error: 'DATABASE_ERROR',
        message: 'Unable to verify vendor account. Please try again.',
        code: 'AUTH_005'
      });
    }

    // Check if vendor exists
    if (!vendor) {
      console.warn('🔒 Authentication attempt with non-existent vendor:', {
        vendorId,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });

      return res.status(401).json({ 
        success: false,
        error: 'VENDOR_NOT_FOUND',
        message: 'Vendor account not found. Access denied.',
        code: 'AUTH_006'
      });
    }

    // FIXED: Validate vendor account status - handle both old and new data formats
    const vendorStatus = (vendor.status || vendor.account?.status || '').toLowerCase();
    if (vendorStatus !== 'active') {
      console.warn('🔒 Inactive vendor login attempt:', {
        vendorId: vendor._id,
        status: vendorStatus,
        email: vendor.email,
        ip: req.ip,
        statusLocation: vendor.status ? 'vendor.status' : 'vendor.account.status'
      });

      const statusMessages = {
        'pending': 'Vendor account is pending approval. Contact support for assistance.',
        'suspended': 'Vendor account has been suspended. Contact support to restore access.',
        'disabled': 'Vendor account has been disabled. Contact support for assistance.',
        'inactive': 'Vendor account is inactive. Contact support to reactivate your account.'
      };

      return res.status(403).json({ 
        success: false,
        error: 'ACCOUNT_INACTIVE',
        message: statusMessages[vendorStatus] || 'Vendor account is not active. Contact support.',
        code: 'AUTH_007',
        status: vendorStatus
      });
    }

    // Optional: Check for account suspension or security flags
    if (vendor.securityFlags?.suspended) {
      return res.status(403).json({ 
        success: false,
        error: 'ACCOUNT_SUSPENDED',
        message: 'Account temporarily suspended due to security concerns. Contact support.',
        code: 'AUTH_008'
      });
    }

    // Optional: Rate limiting check (if implemented in vendor model)
    if (vendor.lastLoginAttempt && vendor.failedLoginAttempts >= 5) {
      const lockoutExpiry = new Date(vendor.lastLoginAttempt.getTime() + (15 * 60 * 1000)); // 15 minutes
      if (new Date() < lockoutExpiry) {
        return res.status(429).json({ 
          success: false,
          error: 'ACCOUNT_LOCKED',
          message: 'Account temporarily locked due to multiple failed login attempts.',
          code: 'AUTH_009',
          retryAfter: Math.ceil((lockoutExpiry - new Date()) / 1000)
        });
      }
    }

    // Attach vendor information to request object
    req.vendor = {
      id: vendor._id,
      vendorId: vendor._id, // For backward compatibility
      email: vendor.email,
      name: vendor.name || vendor.companyName,
      companyName: vendor.companyName,
      role: vendor.role || 'vendor',
      permissions: vendor.permissions || [],
      status: vendor.status || vendor.account?.status, // FIXED: Handle both data formats
      accountType: vendor.accountType || 'standard',
      // Include any other relevant vendor data
      contactInfo: vendor.contactInfo,
      businessInfo: vendor.businessInfo
    };

    // Add vendor ID for easy access
    req.vendorId = vendor._id;

    // Optional: Update last activity timestamp
    if (process.env.NODE_ENV === 'production') {
      // Fire and forget - don't wait for this update
      Vendor.findByIdAndUpdate(vendor._id, { 
        lastActivity: new Date(),
        $unset: { failedLoginAttempts: 1, lastLoginAttempt: 1 } // Clear failed attempts on successful auth
      }).catch(err => {
        console.warn('⚠️ Failed to update vendor last activity:', err.message);
      });
    }

    // Log successful authentication for security monitoring
    console.log('✅ Vendor authenticated successfully:', {
      vendorId: vendor._id,
      email: vendor.email,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });

    next();

  } catch (error) {
    // Catch-all error handler
    console.error('❌ Unexpected error in vendor authentication:', {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

    return res.status(500).json({ 
      success: false,
      error: 'AUTHENTICATION_ERROR',
      message: 'An unexpected error occurred during authentication.',
      code: 'AUTH_999'
    });
  }
};

/**
 * Middleware for vendor admin routes
 * Requires vendor to have admin privileges
 */
export const vendorAdminAuth = async (req, res, next) => {
  vendorAuth(req, res, () => {
    if (req.vendor && (req.vendor.role === 'admin' || req.vendor.accountType === 'admin')) {
      next();
    } else {
      res.status(403).json({ 
        success: false,
        error: 'INSUFFICIENT_PRIVILEGES',
        message: 'Admin privileges required for this operation.',
        code: 'AUTH_010'
      });
    }
  });
};

/**
 * Middleware for premium vendor features
 * Requires vendor to have premium account
 */
export const vendorPremiumAuth = async (req, res, next) => {
  vendorAuth(req, res, () => {
    const premiumTypes = ['premium', 'enterprise', 'admin'];
    if (req.vendor && premiumTypes.includes(req.vendor.accountType)) {
      next();
    } else {
      res.status(403).json({ 
        success: false,
        error: 'PREMIUM_REQUIRED',
        message: 'Premium account required for this feature.',
        code: 'AUTH_011',
        upgradeUrl: '/vendor/upgrade'
      });
    }
  });
};

/**
 * Flexible role-based vendor middleware
 * @param {Array} allowedRoles - Array of allowed roles/account types
 */
export const requireVendorRole = (allowedRoles = []) => {
  return async (req, res, next) => {
    vendorAuth(req, res, () => {
      const vendorRole = req.vendor?.role || 'vendor';
      const vendorAccountType = req.vendor?.accountType || 'standard';
      
      const hasRole = allowedRoles.includes(vendorRole) || 
                     allowedRoles.includes(vendorAccountType);
      
      if (hasRole) {
        next();
      } else {
        res.status(403).json({ 
          success: false,
          error: 'ROLE_REQUIRED',
          message: `Required role: ${allowedRoles.join(' or ')}.`,
          code: 'AUTH_012',
          currentRole: vendorRole,
          currentAccountType: vendorAccountType
        });
      }
    });
  };
};

export default vendorAuth;
