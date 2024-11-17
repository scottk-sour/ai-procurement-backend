// middleware/vendorAuth.js
const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  try {
    // Extract token from the Authorization header
    const authHeader = req.header('Authorization');
    if (!authHeader) {
      return res.status(401).json({ message: 'No token provided. Authorization denied.' });
    }

    // Ensure the token is in the correct format: "Bearer <token>"
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Malformed token. Authorization denied.' });
    }

    // Verify the token using the secret key
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

    // Check if it's a vendor token and proceed
    if (decoded.vendorId) {
      req.vendorId = decoded.vendorId; // Set req.vendorId for subsequent handlers
      next(); // Proceed to the next middleware or route handler
    } else {
      return res.status(403).json({ message: 'Authorization denied. Invalid vendor token.' });
    }
  } catch (err) {
    console.error('Unexpected error in authentication:', err.message);
    res.status(500).json({ message: 'Internal server error during authentication.' });
  }
};
