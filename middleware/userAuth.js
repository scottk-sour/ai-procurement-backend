// middleware/userAuth.js

const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function (req, res, next) {
  try {
    // Extract token from the Authorization header
    const authHeader = req.header('Authorization');
    if (!authHeader) {
      return res.status(401).json({ message: 'No token provided, authorization denied' });
    }

    // Ensure the token is in the correct format: "Bearer <token>"
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Malformed token, authorization denied' });
    }

    // Verify the token using the secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if the token contains the user ID and is valid
    if (!decoded || !decoded.userId) {
      return res.status(403).json({ message: 'Invalid token, authorization denied' });
    }

    // Fetch the user from the database
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found, authorization denied' });
    }

    // Attach user ID to the request object for further use
    req.userId = decoded.userId;
    next(); // Proceed to the next middleware or route handler
  } catch (err) {
    console.error('Token verification failed:', err.message);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};
