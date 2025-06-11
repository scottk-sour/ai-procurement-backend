// middleware/vendorAuth.js
import jwt from 'jsonwebtoken';
import Vendor from "../models/Vendor.js";
import dotenv from 'dotenv';

dotenv.config();

const { JWT_SECRET } = process.env;
if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET must be defined in environment variables.');
  process.exit(1);
}

/**
 * Middleware to protect routes for authenticated vendors.
 * Verifies Bearer token, loads vendor, and attaches to req.
 */
const vendorAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Access denied. Malformed token.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const vendorId = decoded.vendorId;
    if (!vendorId) {
      return res.status(403).json({ message: 'Invalid authentication. Access denied.' });
    }

    const vendor = await Vendor.findById(vendorId).select('-password -__v').lean();
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor account not found. Access denied.' });
    }

    if (vendor.status?.toLowerCase() !== 'active') {
      return res.status(403).json({ message: 'Vendor account is inactive. Contact support.' });
    }

    req.vendorId = vendor._id;
    req.vendor = vendor;

    next();
  } catch (err) {
    console.error(`❌ Vendor authentication error:`, err);
    const msg = err.name === 'TokenExpiredError'
      ? 'Session expired. Please log in again.'
      : 'Invalid or expired token';
    res.status(401).json({ message: msg });
  }
};

export default vendorAuth;
