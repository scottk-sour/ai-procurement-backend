import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Production-level user authentication middleware
 * Provides secure JWT validation, comprehensive error handling, and role-based access control
 */

// Environment validation - fail fast if JWT_SECRET is missing
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET environment variable is required for secure operation');
  process.exit(1);
}

// Security configuration
const SECURITY_CONFIG = {
  maxFailedAttempts: 5,
  lockoutDuration: 15 * 60 * 1000, // 15 minutes in milliseconds
  tokenBlacklistEnabled: process.env.TOKEN_BLACKLIST_ENABLED === 'true',
  auditLogging: process.env.AUDIT_LOGGING === 'true'
};

// Token extraction utility with multiple format support
const extractToken = (req) => {
  // Primary: Authorization Bearer header
  const authHeader = req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Fallback: Custom auth header (for legacy clients)
  const customToken = req.header('x-auth-token');
  if (customToken) {
    return customToken;
  }
  
  // Optional: Query parameter (for specific use cases - less secure)
  if (req.query.token && process.env.ALLOW_QUERY_TOKEN === 'true') {
    return req.query.token;
  }
  
  return null;
};

// Audit logging utility
const auditLog = (event, data = {}) => {
  if (SECURITY_CONFIG.auditLogging) {
    console.log(`🔍 AUDIT: ${event}`, {
      timestamp: new Date().toISOString(),
      ...data
    });
  }
};

/**
 * Main user authentication middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object  
 * @param {Function} next - Express next middleware function
 */
const userAuth = async (req, res, next) => {
  const startTime = Date.now();
  const clientIp = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent');

  try {
    // Extract authentication token
    const token = extractToken(req);
    
    if (!token) {
      auditLog('AUTH_FAILED_NO_TOKEN', { ip: clientIp, userAgent });
      
      return res.status(401).json({ 
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Access denied. Authentication token required.',
        code: 'USER_AUTH_001'
      });
    }

    // Verify and decode JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      auditLog('AUTH_FAILED_INVALID_TOKEN', { 
        error: jwtError.name,
        ip: clientIp,
        userAgent 
      });

      const errorResponse = {
        success: false,
        error: 'INVALID_TOKEN',
        code: 'USER_AUTH_002'
      };

      if (jwtError.name === 'TokenExpiredError') {
        errorResponse.message = 'Authentication token has expired. Please log in again.';
        errorResponse.code = 'USER_AUTH_003';
        errorResponse.expired = true;
      } else if (jwtError.name === 'JsonWebTokenError') {
        errorResponse.message = 'Invalid authentication token format.';
      } else if (jwtError.name === 'NotBeforeError') {
        errorResponse.message = 'Token not yet valid.';
        errorResponse.code = 'USER_AUTH_004';
      } else {
        errorResponse.message = 'Token verification failed.';
      }

      return res.status(401).json(errorResponse);
    }

    // Validate token payload structure
    if (!decoded.userId) {
      auditLog('AUTH_FAILED_INVALID_PAYLOAD', { 
        payload: Object.keys(decoded),
        ip: clientIp 
      });

      return res.status(401).json({ 
        success: false,
        error: 'INVALID_TOKEN_STRUCTURE',
        message: 'Authentication token is malformed.',
        code: 'USER_AUTH_005'
      });
    }

    // Optional: Check token blacklist (if implemented)
    if (SECURITY_CONFIG.tokenBlacklistEnabled) {
      // Implementation would check against a blacklist store (Redis, DB, etc.)
      // const isBlacklisted = await checkTokenBlacklist(token);
      // if (isBlacklisted) { return unauthorized response }
    }

    // Fetch user from database with comprehensive error handling
    let user;
    try {
      user = await User.findById(decoded.userId)
        .select('-password -resetPasswordToken -resetPasswordExpires -__v')
        .lean();
    } catch (dbError) {
      console.error('❌ Database error during user lookup:', {
        userId: decoded.userId,
        error: dbError.message,
        stack: process.env.NODE_ENV === 'development' ? dbError.stack : undefined
      });

      return res.status(500).json({ 
        success: false,
        error: 'DATABASE_ERROR',
        message: 'Unable to verify user account. Please try again.',
        code: 'USER_AUTH_006'
      });
    }

    // Verify user exists
    if (!user) {
      auditLog('AUTH_FAILED_USER_NOT_FOUND', { 
        userId: decoded.userId,
        ip: clientIp 
      });

      return res.status(401).json({ 
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'User account not found. Please log in again.',
        code: 'USER_AUTH_007'
      });
    }

    // Check user account status
    if (user.status && user.status.toLowerCase() !== 'active') {
      auditLog('AUTH_FAILED_INACTIVE_ACCOUNT', { 
        userId: user._id,
        status: user.status,
        email: user.email,
        ip: clientIp 
      });

      const statusMessages = {
        'pending': 'Account verification pending. Please check your email.',
        'suspended': 'Account has been suspended. Contact support for assistance.',
        'disabled': 'Account has been disabled. Contact support for assistance.',
        'inactive': 'Account is inactive. Contact support to reactivate.'
      };

      return res.status(403).json({ 
        success: false,
        error: 'ACCOUNT_INACTIVE',
        message: statusMessages[user.status.toLowerCase()] || 'Account is not active.',
        code: 'USER_AUTH_008',
        status: user.status
      });
    }

    // Optional: Check for security flags
    if (user.securityFlags?.locked) {
      const lockExpiry = user.securityFlags.lockExpiry;
      if (!lockExpiry || new Date() < lockExpiry) {
        return res.status(423).json({ 
          success: false,
          error: 'ACCOUNT_LOCKED',
          message: 'Account is temporarily locked. Contact support or try again later.',
          code: 'USER_AUTH_009',
          retryAfter: lockExpiry ? Math.ceil((lockExpiry - new Date()) / 1000) : null
        });
      }
    }

    // Optional: Rate limiting for failed attempts
    if (user.failedLoginAttempts >= SECURITY_CONFIG.maxFailedAttempts) {
      const lockoutExpiry = new Date(
        (user.lastFailedLogin?.getTime() || Date.now()) + SECURITY_CONFIG.lockoutDuration
      );
      
      if (new Date() < lockoutExpiry) {
        return res.status(429).json({ 
          success: false,
          error: 'TOO_MANY_ATTEMPTS',
          message: 'Account temporarily locked due to multiple failed login attempts.',
          code: 'USER_AUTH_010',
          retryAfter: Math.ceil((lockoutExpiry - new Date()) / 1000)
        });
      }
    }

    // Build authenticated user object
    req.user = {
      userId: user._id,
      id: user._id, // Alternative accessor
      email: decoded.email || user.email,
      role: decoded.role || user.role || 'user',
      name: decoded.name || user.name || user.firstName || 'User',
      permissions: user.permissions || [],
      accountType: user.accountType || 'standard',
      preferences: user.preferences || {},
      
      // Full user data for complex operations
      userData: user,
      
      // Token metadata
      tokenIssuedAt: decoded.iat ? new Date(decoded.iat * 1000) : null,
      tokenExpiresAt: decoded.exp ? new Date(decoded.exp * 1000) : null
    };

    // Add user ID for backward compatibility
    req.userId = user._id;

    // Optional: Update user activity and clear failed attempts
    if (process.env.NODE_ENV === 'production') {
      // Fire and forget - don't wait for this update
      User.findByIdAndUpdate(user._id, { 
        lastActivity: new Date(),
        lastLoginIp: clientIp,
        $unset: { 
          failedLoginAttempts: 1, 
          lastFailedLogin: 1 
        }
      }).catch(err => {
        console.warn('⚠️ Failed to update user activity:', err.message);
      });
    }

    // Success audit log
    auditLog('AUTH_SUCCESS', { 
      userId: user._id,
      email: user.email,
      role: req.user.role,
      ip: clientIp,
      duration: Date.now() - startTime
    });

    next();

  } catch (error) {
    // Comprehensive error handling for unexpected issues
    console.error('❌ Unexpected error in user authentication:', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      ip: clientIp,
      userAgent,
      duration: Date.now() - startTime
    });

    auditLog('AUTH_ERROR', { 
      error: error.message,
      ip: clientIp,
      duration: Date.now() - startTime
    });

    return res.status(500).json({ 
      success: false,
      error: 'AUTHENTICATION_ERROR',
      message: 'An unexpected error occurred during authentication.',
      code: 'USER_AUTH_999'
    });
  }
};

/**
 * Admin-only middleware
 * Requires user to have admin role
 */
export const adminAuth = async (req, res, next) => {
  userAuth(req, res, () => {
    if (req.user && req.user.role === 'admin') {
      auditLog('ADMIN_ACCESS', { 
        userId: req.user.userId,
        route: req.route?.path || req.path,
        method: req.method
      });
      next();
    } else {
      auditLog('ADMIN_ACCESS_DENIED', { 
        userId: req.user?.userId,
        role: req.user?.role,
        route: req.route?.path || req.path
      });
      
      res.status(403).json({ 
        success: false,
        error: 'INSUFFICIENT_PRIVILEGES',
        message: 'Admin privileges required for this operation.',
        code: 'USER_AUTH_011'
      });
    }
  });
};

/**
 * Vendor-only middleware (for users with vendor role)
 * Allows vendors and admins
 */
export const vendorAuth = async (req, res, next) => {
  userAuth(req, res, () => {
    const allowedRoles = ['vendor', 'admin'];
    if (req.user && allowedRoles.includes(req.user.role)) {
      next();
    } else {
      res.status(403).json({ 
        success: false,
        error: 'VENDOR_PRIVILEGES_REQUIRED',
        message: 'Vendor privileges required for this operation.',
        code: 'USER_AUTH_012',
        currentRole: req.user?.role
      });
    }
  });
};

/**
 * User-only middleware (excludes vendors and admins)
 * For customer-specific operations
 */
export const customerAuth = async (req, res, next) => {
  userAuth(req, res, () => {
    if (req.user && req.user.role === 'user') {
      next();
    } else {
      res.status(403).json({ 
        success: false,
        error: 'CUSTOMER_ACCOUNT_REQUIRED',
        message: 'Customer account required for this operation.',
        code: 'USER_AUTH_013',
        currentRole: req.user?.role
      });
    }
  });
};

/**
 * Premium user middleware
 * Requires premium account type
 */
export const premiumAuth = async (req, res, next) => {
  userAuth(req, res, () => {
    const premiumTypes = ['premium', 'enterprise', 'admin'];
    const userAccountType = req.user?.accountType || 'standard';
    
    if (premiumTypes.includes(userAccountType) || req.user?.role === 'admin') {
      next();
    } else {
      res.status(403).json({ 
        success: false,
        error: 'PREMIUM_REQUIRED',
        message: 'Premium account required for this feature.',
        code: 'USER_AUTH_014',
        currentAccountType: userAccountType,
        upgradeUrl: '/upgrade'
      });
    }
  });
};

/**
 * Flexible role-based middleware factory
 * @param {Array} roles - Array of allowed roles
 * @param {Object} options - Additional options
 */
export const requireRole = (roles = [], options = {}) => {
  return async (req, res, next) => {
    userAuth(req, res, () => {
      const userRole = req.user?.role;
      const hasRole = roles.includes(userRole);
      
      // Optional: Check account type as well
      if (options.checkAccountType) {
        const userAccountType = req.user?.accountType;
        const hasAccountType = roles.includes(userAccountType);
        if (hasRole || hasAccountType) {
          return next();
        }
      } else if (hasRole) {
        return next();
      }
      
      res.status(403).json({ 
        success: false,
        error: 'ROLE_REQUIRED',
        message: `Required role: ${roles.join(' or ')}.`,
        code: 'USER_AUTH_015',
        currentRole: userRole,
        currentAccountType: req.user?.accountType,
        allowedRoles: roles
      });
    });
  };
};

/**
 * Permission-based middleware
 * @param {String|Array} permissions - Required permission(s)
 */
export const requirePermission = (permissions) => {
  const requiredPerms = Array.isArray(permissions) ? permissions : [permissions];
  
  return async (req, res, next) => {
    userAuth(req, res, () => {
      const userPermissions = req.user?.permissions || [];
      const hasPermission = requiredPerms.some(perm => userPermissions.includes(perm));
      
      // Admins have all permissions
      if (req.user?.role === 'admin' || hasPermission) {
        next();
      } else {
        res.status(403).json({ 
          success: false,
          error: 'PERMISSION_REQUIRED',
          message: `Required permission: ${requiredPerms.join(' or ')}.`,
          code: 'USER_AUTH_016',
          requiredPermissions: requiredPerms,
          userPermissions: userPermissions
        });
      }
    });
  };
};

export default userAuth;
