import jwt from 'jsonwebtoken';
import 'dotenv/config';

const { ADMIN_JWT_SECRET } = process.env;

const adminAuth = (req, res, next) => {
  try {
    // Extract the Bearer token from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];

    // Verify the token
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);

    // Check if the token has the 'admin' role
    if (decoded.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Not authorized.' });
    }

    // Add decoded token data to the request for later use
    req.admin = decoded;

    // Proceed to the next middleware or route handler
    next();
  } catch (error) {
    console.error('Admin authentication error:', error.message);
    return res.status(400).json({ message: 'Invalid or expired token.' });
  }
};

export default adminAuth;
