const jwt = require('jsonwebtoken');
const Vendor = require('../models/Vendor');

module.exports = async function (req, res, next) {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader) {
      return res.status(401).json({ message: 'No token provided. Authorization denied.' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Malformed token. Authorization denied.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        console.error('Token has expired');
        return res.status(401).json({ message: 'Token expired. Please log in again.' });
      }
      console.error('Token verification failed:', err.message);
      return res.status(401).json({ message: 'Invalid token. Authorization denied.' });
    }

    if (decoded.vendorId) {
      // Check if vendor exists in the database
      const vendor = await Vendor.findById(decoded.vendorId).select('-password');
      if (!vendor) {
        return res.status(404).json({ message: 'Vendor not found. Authorization denied.' });
      }

      req.vendorId = vendor.id;
      req.vendor = vendor; // Optionally attach vendor object
      next();
    } else {
      return res.status(403).json({ message: 'Authorization denied. Invalid vendor token.' });
    }
  } catch (err) {
    console.error('Unexpected error in authentication:', err.message);
    res.status(500).json({ message: 'Internal server error during authentication.' });
  }
};
