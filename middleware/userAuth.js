// middleware/userAuth.js

const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function (req, res, next) {
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

    // Check if it's a user token and proceed
    if (decoded.userId) {
      req.userId = decoded.userId; // Set req.userId for subsequent handlers
      const user = await User.findById(req.userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      next(); // Proceed to the next middleware or route handler
    } else {
      return res.status(403).json({ message: 'Authorization denied for user' });
    }
  } catch (err) {
    console.error('Token verification failed:', err.message);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};
