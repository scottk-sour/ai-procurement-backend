// middleware/userAuth.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const userAuth = async (req, res, next) => {
  try {
    // Check for the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided, authorization denied.' });
    }

    // Extract the token from the Authorization header
    const token = authHeader.split(' ')[1];

    // Verify the token using the secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.userId) {
      return res.status(403).json({ message: 'Invalid token, authorization denied.' });
    }

    // Check if the user exists in the database
    const user = await User.findById(decoded.userId).select('-password'); // Exclude password field
    if (!user) {
      return res.status(404).json({ message: 'User not found, authorization denied.' });
    }

    // Attach user details to the request object
    req.userId = user._id; // User ID from the database
    req.user = user; // Optionally attach the full user object for further use

    // Proceed to the next middleware or route handler
    next();
  } catch (err) {
    console.error('Token verification failed:', err.message);
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

export default userAuth;
