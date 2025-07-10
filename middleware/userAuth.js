import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const auth = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : req.header('x-auth-token');

    if (!token) {
      return res.status(401).json({ 
        error: 'No token provided. Access denied.' 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user still exists
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).json({ 
        error: 'Token is valid but user no longer exists.' 
      });
    }

    // Note: Removed isActive check since your User model doesn't have this field
    // If you want to add user activation, add isActive field to your User model

    // Add user to request
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
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
        error: 'Token has expired.' 
      });
    }
    
    res.status(500).json({ 
      error: 'Server error during authentication.' 
    });
  }
};

// Admin-only middleware
export const adminAuth = async (req, res, next) => {
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

// Vendor-only middleware
export const vendorAuth = async (req, res, next) => {
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

export default auth;