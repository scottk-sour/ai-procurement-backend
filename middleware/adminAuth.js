import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js'; // Assuming you have an Admin model

/**
 * Production-level admin authentication middleware
 * Provides secure JWT validation, comprehensive audit logging, and admin-specific security controls
 */

// Environment validation with fallback
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
if (!ADMIN_JWT_SECRET) {
  console.error('❌ FATAL: ADMIN_JWT_SECRET or JWT_SECRET environment variable is required');
  process.exit(1);
}

// Security configuration for admin authentication
const ADMIN_SECURITY_CONFIG = {
  maxFailedAttempts: 3, // Stricter for admin accounts
  lockoutDuration: 30 * 60 * 1000, // 30 minutes for admin lockout
  requireMFA: process.env.ADMIN_REQUIRE_MFA === 'true',
  sessionTimeout: 2 * 60 * 60 * 1000, // 2 hours for admin sessions
  auditLogging: true, // Always audit admin access
  ipWhitelist: process.env.ADMIN_IP_WHITELIST?.split(',') || null
};

// Extract token from multiple sources
const extractAdminToken = (req) => {
  // Primary: Authorization Bearer header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Fallback: Admin-specific header
  const adminToken = req.headers['x-admin-token'];
  if (adminToken) {
    return adminToken;
  }
  
  return null;
};

// Admin audit logging
const adminAuditLog = (event, data = {}) => {
  console.log(`🔐 ADMIN_AUDIT: ${event}`, {
    timestamp: new Date().toISOString(),
    severity: 'HIGH',
    ...data
  });

  // In production, also send to external audit system
  if (process.env.NODE_ENV === 'production' && process.env.AUDIT_WEBHOOK_URL) {
    // Send to external audit service (implement as needed)
    // sendToAuditService(event, data);
  }
};

// IP whitelist validation
const validateAdminIP = (clientIP) => {
  if (!ADMIN_SECURITY_CONFIG.ipWhitelist) {
    return true; // No IP restrictions configured
  }

  return ADMIN_SECURITY_CONFIG.ipWhitelist.some(allowedIP => {
    // Support CIDR notation or exact match
    return clientIP === allowedIP || clientIP.startsWith(allowedIP);
  });
};

/**
 * Main admin authentication middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const adminAuth = async (req, res, next) => {
  const startTime = Date.now();
  const clientIP = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent');
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // IP whitelist check (if configured)
    if (!validateAdminIP(clientIP)) {
      adminAuditLog('ADMIN_ACCESS_BLOCKED_IP', {
        ip: clientIP,
        userAgent,
        requestId,
        route: req.originalUrl
      });

      return res.status(403).json({
        success: false,
        error: 'IP_NOT_AUTHORIZED',
        message: 'Access denied. IP address not authorized for admin access.',
        code: 'ADMIN_AUTH_001',
        requestId
      });
    }

    // Extract authentication token
    const token = extractAdminToken(req);
    
    if (!token) {
      adminAuditLog('ADMIN_AUTH_FAILED_NO_TOKEN', {
        ip: clientIP,
        userAgent,
        requestId,
        route: req.originalUrl
      });

      return res.status(401).json({
        success: false,
        error: 'ADMIN_TOKEN_REQUIRED',
        message: 'Access denied. Admin authentication token required.',
        code: 'ADMIN_AUTH_002',
        requestId
      });
    }

    // Verify and decode JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    } catch (jwtError) {
      adminAuditLog('ADMIN_AUTH_FAILED_INVALID_TOKEN', {
        error: jwtError.name,
        ip: clientIP,
        userAgent,
        requestId,
        route: req.originalUrl
      });

      const errorResponse = {
        success: false,
        error: 'INVALID_ADMIN_TOKEN',
        code: 'ADMIN_AUTH_003',
        requestId
      };

      if (jwtError.name === 'TokenExpiredError') {
        errorResponse.message = 'Admin session has expired. Please log in again.';
        errorResponse.code = 'ADMIN_AUTH_004';
        errorResponse.expired = true;
      } else if (jwtError.name === 'JsonWebTokenError') {
        errorResponse.message = 'Invalid admin authentication token.';
      } else {
        errorResponse.message = 'Admin token verification failed.';
      }

      return res.status(401).json(errorResponse);
    }

    // Validate admin role in token
    if (decoded.role !== 'admin') {
      adminAuditLog('ADMIN_AUTH_FAILED_INSUFFICIENT_ROLE', {
        userId: decoded.userId || decoded.adminId,
        role: decoded.role,
        ip: clientIP,
        requestId
      });

      return res.status(403).json({
        success: false,
        error: 'INSUFFICIENT_ADMIN_PRIVILEGES',
        message: 'Access denied. Admin privileges required.',
        code: 'ADMIN_AUTH_005',
        currentRole: decoded.role,
        requestId
      });
    }

    // Validate token structure
    const adminId = decoded.adminId || decoded.userId;
    if (!adminId) {
      adminAuditLog('ADMIN_AUTH_FAILED_INVALID_PAYLOAD', {
        payload: Object.keys(decoded),
        ip: clientIP,
        requestId
      });

      return res.status(401).json({
        success: false,
        error: 'INVALID_ADMIN_TOKEN_STRUCTURE',
        message: 'Admin authentication token is malformed.',
        code: 'ADMIN_AUTH_006',
        requestId
      });
    }

    // Check session timeout (if issued timestamp is available)
    if (decoded.iat) {
      const tokenAge = Date.now() - (decoded.iat * 1000);
      if (tokenAge > ADMIN_SECURITY_CONFIG.sessionTimeout) {
        adminAuditLog('ADMIN_SESSION_TIMEOUT', {
          adminId,
          tokenAge: Math.round(tokenAge / 1000),
          maxAge: Math.round(ADMIN_SECURITY_CONFIG.sessionTimeout / 1000),
          ip: clientIP,
          requestId
        });

        return res.status(401).json({
          success: false,
          error: 'ADMIN_SESSION_TIMEOUT',
          message: 'Admin session has timed out. Please log in again.',
          code: 'ADMIN_AUTH_007',
          requestId
        });
      }
    }

    // Optional: Fetch admin from database for additional validation
    let admin = null;
    if (process.env.VALIDATE_ADMIN_IN_DB === 'true') {
      try {
        admin = await Admin.findById(adminId)
          .select('-password -resetPasswordToken -resetPasswordExpires')
          .lean();

        if (!admin) {
          adminAuditLog('ADMIN_AUTH_FAILED_NOT_FOUND', {
            adminId,
            ip: clientIP,
            requestId
          });

          return res.status(401).json({
            success: false,
            error: 'ADMIN_ACCOUNT_NOT_FOUND',
            message: 'Admin account not found.',
            code: 'ADMIN_AUTH_008',
            requestId
          });
        }

        // Check admin account status
        if (admin.status && admin.status.toLowerCase() !== 'active') {
          adminAuditLog('ADMIN_AUTH_FAILED_INACTIVE', {
            adminId,
            status: admin.status,
            ip: clientIP,
            requestId
          });

          return res.status(403).json({
            success: false,
            error: 'ADMIN_ACCOUNT_INACTIVE',
            message: 'Admin account is not active. Contact system administrator.',
            code: 'ADMIN_AUTH_009',
            status: admin.status,
            requestId
          });
        }

        // Check for account lockout
        if (admin.securityFlags?.locked) {
          return res.status(423).json({
            success: false,
            error: 'ADMIN_ACCOUNT_LOCKED',
            message: 'Admin account is locked due to security concerns.',
            code: 'ADMIN_AUTH_010',
            requestId
          });
        }

      } catch (dbError) {
        console.error('❌ Database error during admin lookup:', {
          adminId,
          error: dbError.message,
          requestId
        });

        return res.status(500).json({
          success: false,
          error: 'DATABASE_ERROR',
          message: 'Unable to verify admin account.',
          code: 'ADMIN_AUTH_011',
          requestId
        });
      }
    }

    // MFA validation (if required)
    if (ADMIN_SECURITY_CONFIG.requireMFA && !decoded.mfaVerified) {
      adminAuditLog('ADMIN_AUTH_MFA_REQUIRED', {
        adminId,
        ip: clientIP,
        requestId
      });

      return res.status(403).json({
        success: false,
        error: 'MFA_REQUIRED',
        message: 'Multi-factor authentication required for admin access.',
        code: 'ADMIN_AUTH_012',
        requestId,
        mfaSetupUrl: '/admin/setup-mfa'
      });
    }

    // Build admin request object
    req.admin = {
      id: adminId,
      adminId: adminId,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name || (admin && admin.name),
      permissions: decoded.permissions || (admin && admin.permissions) || ['*'],
      
      // Token metadata
      tokenIssuedAt: decoded.iat ? new Date(decoded.iat * 1000) : null,
      tokenExpiresAt: decoded.exp ? new Date(decoded.exp * 1000) : null,
      
      // Security context
      clientIP: clientIP,
      userAgent: userAgent,
      requestId: requestId,
      
      // Full admin data (if fetched)
      adminData: admin
    };

    // Optional: Update admin activity
    if (admin && process.env.NODE_ENV === 'production') {
      Admin.findByIdAndUpdate(adminId, {
        lastActivity: new Date(),
        lastLoginIP: clientIP,
        $unset: { failedLoginAttempts: 1 }
      }).catch(err => {
        console.warn('⚠️ Failed to update admin activity:', err.message);
      });
    }

    // Success audit log
    adminAuditLog('ADMIN_AUTH_SUCCESS', {
      adminId,
      email: decoded.email,
      ip: clientIP,
      userAgent,
      requestId,
      route: req.originalUrl,
      method: req.method,
      duration: Date.now() - startTime
    });

    next();

  } catch (error) {
    console.error('❌ Unexpected error in admin authentication:', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      ip: clientIP,
      requestId,
      duration: Date.now() - startTime
    });

    adminAuditLog('ADMIN_AUTH_ERROR', {
      error: error.message,
      ip: clientIP,
      requestId,
      duration: Date.now() - startTime
    });

    return res.status(500).json({
      success: false,
      error: 'ADMIN_AUTHENTICATION_ERROR',
      message: 'An unexpected error occurred during admin authentication.',
      code: 'ADMIN_AUTH_999',
      requestId
    });
  }
};

/**
 * Super admin middleware - requires highest level admin access
 */
export const superAdminAuth = async (req, res, next) => {
  adminAuth(req, res, () => {
    const isSuperAdmin = req.admin.permissions?.includes('super_admin') || 
                        req.admin.role === 'super_admin';
    
    if (isSuperAdmin) {
      adminAuditLog('SUPER_ADMIN_ACCESS', {
        adminId: req.admin.id,
        route: req.originalUrl,
        method: req.method,
        ip: req.admin.clientIP
      });
      next();
    } else {
      adminAuditLog('SUPER_ADMIN_ACCESS_DENIED', {
        adminId: req.admin.id,
        permissions: req.admin.permissions,
        route: req.originalUrl,
        ip: req.admin.clientIP
      });

      res.status(403).json({
        success: false,
        error: 'SUPER_ADMIN_REQUIRED',
        message: 'Super admin privileges required for this operation.',
        code: 'ADMIN_AUTH_013',
        requestId: req.admin.requestId
      });
    }
  });
};

/**
 * Admin permission-based middleware
 * @param {String|Array} permissions - Required permission(s)
 */
export const requireAdminPermission = (permissions) => {
  const requiredPerms = Array.isArray(permissions) ? permissions : [permissions];
  
  return async (req, res, next) => {
    adminAuth(req, res, () => {
      const adminPermissions = req.admin?.permissions || [];
      
      // Super admin has all permissions
      if (adminPermissions.includes('*') || adminPermissions.includes('super_admin')) {
        return next();
      }
      
      const hasPermission = requiredPerms.some(perm => adminPermissions.includes(perm));
      
      if (hasPermission) {
        next();
      } else {
        adminAuditLog('ADMIN_PERMISSION_DENIED', {
          adminId: req.admin.id,
          requiredPermissions: requiredPerms,
          adminPermissions: adminPermissions,
          route: req.originalUrl,
          ip: req.admin.clientIP
        });

        res.status(403).json({
          success: false,
          error: 'ADMIN_PERMISSION_REQUIRED',
          message: `Required admin permission: ${requiredPerms.join(' or ')}.`,
          code: 'ADMIN_AUTH_014',
          requiredPermissions: requiredPerms,
          requestId: req.admin.requestId
        });
      }
    });
  };
};

export default adminAuth;
