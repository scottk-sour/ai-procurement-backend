import jwt from 'jsonwebtoken';
import Vendor from '../models/Vendor.js';

const vendorAuth = async (req, res, next) => {
  try {
    // Extract the Authorization header
    const authHeader = req.header('Authorization');
    if (!authHeader) {
      return res.status(401).json({ message: 'No token provided. Authorization denied.' });
    }

    // Extract the token from the header
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Malformed token. Authorization denied.' });
    }

    // Verify the token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        console.error('Token has expired:', err.message);
        return res.status(401).json({ message: 'Token expired. Please log in again.' });
      }
      console.error('Token verification failed:', err.message);
      return res.status(401).json({ message: 'Invalid token. Authorization denied.' });
    }

    // Validate the decoded token for a vendorId
    if (!decoded.vendorId) {
      return res.status(403).json({ message: 'Authorization denied. Invalid vendor token.' });
    }

    // Check if vendor exists in the database
    const vendor = await Vendor.findById(decoded.vendorId).select('-password');
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found. Authorization denied.' });
    }

    // Attach vendor data to the request object
    req.vendorId = vendor._id;
    req.vendor = vendor;

    // Proceed to the next middleware or route handler
    next();
  } catch (err) {
    console.error('Unexpected error in authentication middleware:', err.message);
    res.status(500).json({ message: 'Internal server error during authentication.' });
  }
};

export default vendorAuth;
