// middleware/vendorAuth.js

const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  try {
    // Extract token from the Authorization header
    const authHeader = req.header('Authorization');
    if (!authHeader) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    // Ensure the token is in the correct format: "Bearer <token>"
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Malformed token, authorization denied' });
    }

    // Verify the token using the secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if it's a vendor token and proceed
    if (decoded.vendorId) {
      req.vendorId = decoded.vendorId; // Set req.vendorId for subsequent handlers
      next(); // Proceed to the next middleware or route handler
    } else {
      return res.status(403).json({ message: 'Authorization denied for vendor' });
    }
  } catch (err) {
    console.error('Token verification failed:', err.message);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};
