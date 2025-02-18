import jwt from 'jsonwebtoken';
import Vendor from '../models/Vendor.js';
import dotenv from 'dotenv';

dotenv.config();

const vendorAuth = async (req, res, next) => {
  try {
    // 🔍 Step 1: Extract & Validate Authorization Header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn('⚠️ No valid token provided.');
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    // 🔍 Step 2: Extract JWT Token
    const token = authHeader.split(' ')[1];
    if (!token) {
      console.warn('⚠️ Malformed Authorization header.');
      return res.status(401).json({ message: 'Access denied. Malformed token.' });
    }

    // 🔍 Step 3: Verify JWT Token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      console.error(`🔴 Token verification failed: ${err.message}`);
      return res.status(401).json({
        message: err.name === 'TokenExpiredError' ? 'Session expired. Please log in again.' : 'Invalid token. Access denied.',
      });
    }

    // 🔍 Step 4: Ensure Token Contains a Vendor ID
    if (!decoded.vendorId) {
      console.warn('⚠️ Token does not contain a valid vendor ID.');
      return res.status(403).json({ message: 'Invalid authentication. Access denied.' });
    }

    // 🔍 Step 5: Fetch Vendor from Database & Use `.lean()` for Optimization
    const vendor = await Vendor.findById(decoded.vendorId).select('-password').lean();
    if (!vendor) {
      console.warn(`⚠️ Vendor with ID ${decoded.vendorId} not found.`);
      return res.status(404).json({ message: 'Vendor account not found. Access denied.' });
    }

    // 🔍 Step 6: Ensure Vendor Account is Active (Case-insensitive check)
    console.log("🔍 Vendor Status from Backend:", vendor.status);
    if (vendor.status?.toLowerCase() !== 'active') {
      console.warn(`⚠️ Vendor account "${vendor.company || vendor.name}" is inactive.`);
      return res.status(403).json({ message: 'Vendor account is inactive. Contact support.' });
    }

    // ✅ Step 7: Attach Vendor Data to Request Object
    req.vendorId = vendor._id;
    req.vendor = vendor;

    // ✅ Step 8: Proceed to Next Middleware
    next();
  } catch (err) {
    console.error(`❌ Unexpected error in vendor authentication: ${err.message}`);
    res.status(500).json({
      message: 'Internal server error during authentication.',
      error: err.message,
    });
  }
};

export default vendorAuth;
