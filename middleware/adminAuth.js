import jwt from 'jsonwebtoken';

/**
 * Admin authentication middleware.
 * Verifies JWT signed with ADMIN_JWT_SECRET and checks role === 'admin'.
 * Compatible with token format: { role: 'admin' }
 */

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
if (!ADMIN_JWT_SECRET) {
  console.error('FATAL: ADMIN_JWT_SECRET environment variable is required');
  process.exit(1);
}

const adminAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Not authorized.' });
    }
    req.admin = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Admin session has expired. Please log in again.' });
    }
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

export default adminAuth;
