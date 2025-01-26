import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import QuoteRequest from '../models/QuoteRequest.js';
import UserDocument from '../models/UserDocument.js';
import 'dotenv/config';

const router = express.Router();

// Destructure environment variables
const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_JWT_SECRET } = process.env;

// Middleware for admin authentication
const adminAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]; // Extract Bearer token

  if (!token) {
    return res
      .status(401)
      .json({ status: 'error', message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res
        .status(403)
        .json({ status: 'error', message: 'Access denied. Not authorized.' });
    }
    next();
  } catch (error) {
    console.error('Token verification error:', error.message);
    return res
      .status(401)
      .json({ status: 'error', message: 'Invalid or expired token.' });
  }
};

// Admin Login Route
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ status: 'error', message: 'Email and password are required.' });
  }

  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    try {
      const token = jwt.sign(
        { role: 'admin' },
        ADMIN_JWT_SECRET,
        { expiresIn: '2h' }
      );
      return res
        .status(200)
        .json({ status: 'success', token, message: 'Login successful.' });
    } catch (error) {
      console.error('Error generating token:', error.message);
      return res
        .status(500)
        .json({ status: 'error', message: 'Internal server error.' });
    }
  } else {
    return res
      .status(401)
      .json({ status: 'error', message: 'Invalid credentials.' });
  }
});

// Endpoint to get total users
router.get('/total-users', adminAuth, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    res.status(200).json({ status: 'success', totalUsers });
  } catch (error) {
    console.error('Error fetching total users:', error.message);
    res.status(500).json({ status: 'error', message: 'Error fetching total users.' });
  }
});

// Endpoint to get total vendors
router.get('/total-vendors', adminAuth, async (req, res) => {
  try {
    const totalVendors = await Vendor.countDocuments();
    res.status(200).json({ status: 'success', totalVendors });
  } catch (error) {
    console.error('Error fetching total vendors:', error.message);
    res.status(500).json({ status: 'error', message: 'Error fetching total vendors.' });
  }
});

// Endpoint to get total quotes
router.get('/total-quotes', adminAuth, async (req, res) => {
  try {
    const totalQuotes = await QuoteRequest.countDocuments();
    res.status(200).json({ status: 'success', totalQuotes });
  } catch (error) {
    console.error('Error fetching total quotes:', error.message);
    res.status(500).json({ status: 'error', message: 'Error fetching total quotes.' });
  }
});

// Endpoint to get total uploads
router.get('/total-uploads', adminAuth, async (req, res) => {
  try {
    const totalUploads = await UserDocument.countDocuments();
    res.status(200).json({ status: 'success', totalUploads });
  } catch (error) {
    console.error('Error fetching total uploads:', error.message);
    res.status(500).json({ status: 'error', message: 'Error fetching total uploads.' });
  }
});

// Fetch detailed user list
router.get('/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find({}, 'name email company createdAt');
    res.status(200).json({ status: 'success', data: users });
  } catch (error) {
    console.error('Error fetching users:', error.message);
    res.status(500).json({ status: 'error', message: 'Error fetching users.' });
  }
});

// Fetch detailed vendor list
router.get('/vendors', adminAuth, async (req, res) => {
  try {
    const vendors = await Vendor.find({}, 'name email company services uploads createdAt');
    res.status(200).json({ status: 'success', data: vendors });
  } catch (error) {
    console.error('Error fetching vendors:', error.message);
    res.status(500).json({ status: 'error', message: 'Error fetching vendors.' });
  }
});

export default router;
