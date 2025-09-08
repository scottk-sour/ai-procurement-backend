import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const auth = async (req, res, next) => {
  try {
    // Get token from header - support both Authorization header formats
    const authHeader = req.header('Authorization');
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : req.header('x-auth-token');

    if (!token) {
      return res.status(401).json({ 
        error: 'No token provided. Access denied.' 
      });
    }

    // Verify JWT_SECRET exists
    if (!process.env.JWT_SECRET) {
      console.error('❌ JWT_SECRET not configured');
      return res.status(500).json({ 
        error: 'Server configuration error.' 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Validate decoded token structure
    if (!decoded.userId) {
      return res.status(401).json({ 
        error: 'Invalid token structure.' 
      });
    }
    
    // Check if user still exists
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).json({ 
        error: 'Token is valid but user no longer exists.' 
      });
    }

    // Add user to request - ensure all required fields are present
    req.user = {
      userId: decoded.userId,
      email: decoded.email || user.email,
      role: decoded.role || user.role || 'user',
      name: decoded.name || user.name,
      userData: user
    };

    next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token.' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token has expired. Please log in again.' 
      });
    }

    // Handle MongoDB connection errors
    if (error.name === 'MongoError' || error.name === 'MongooseError') {
      return res.status(500).json({ 
        error: 'Database connection error.' 
      });
    }
    
    res.status(500).json({ 
      error: 'Server error during authentication.' 
    });
  }
};

// Admin-only middleware
export const adminAuth = async (req, res, next) => {
  // First run the base auth middleware
  auth(req, res, () => {
    if (req.user && req.user.role === 'admin') {
      next();
    } else {
      res.status(403).json({ 
        error: 'Access denied. Admin privileges required.' 
      });
    }
  });
};

// Vendor-only middleware (for users with vendor role)
export const vendorAuth = async (req, res, next) => {
  // First run the base auth middleware
  auth(req, res, () => {
    if (req.user && (req.user.role === 'vendor' || req.user.role === 'admin')) {
      next();
    } else {
      res.status(403).json({ 
        error: 'Access denied. Vendor privileges required.' 
      });
    }
  });
};

// User-only middleware (excludes vendors and admins)
export const userAuth = async (req, res, next) => {
  auth(req, res, () => {
    if (req.user && req.user.role === 'user') {
      next();
    } else {
      res.status(403).json({ 
        error: 'Access denied. User account required.' 
      });
    }
  });
};

// Flexible role-based middleware
export const requireRole = (roles) => {
  return async (req, res, next) => {
    auth(req, res, () => {
      if (req.user && roles.includes(req.user.role)) {
        next();
      } else {
        res.status(403).json({ 
          error: `Access denied. Required role: ${roles.join(' or ')}.` 
        });
      }
    });
  };
};

export default userAuth;
