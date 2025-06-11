// middleware/userAuth.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import dotenv from 'dotenv';

dotenv.config();

const { JWT_SECRET } = process.env;
if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET must be defined in environment variables.');
  process.exit(1);
}

/**
 * Middleware to protect routes for authenticated users.
 * Verifies Bearer token, loads user, and attaches to req.
 */
export default async function userAuth(req, res, next) {
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
    const userId = decoded.userId || decoded.id;
    if (!userId) {
      return res.status(401).json({ message: 'Invalid token payload' });
    }

    const user = await User.findById(userId).select('-password -__v').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    req.user = user;
    req.userId = user._id.toString();
    next();
  } catch (err) {
    console.error('❌ Authentication error:', err);
    const msg = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid or expired token';
    return res.status(401).json({ message: msg });
  }
}
