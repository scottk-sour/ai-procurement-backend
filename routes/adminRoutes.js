const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Import User model
const Vendor = require('../models/Vendor'); // Import Vendor model
const QuoteRequest = require('../models/QuoteRequest'); // Import Quote model
const UserDocument = require('../models/UserDocument'); // Import UserDocument model
require('dotenv').config();

const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_JWT_SECRET } = process.env;

// Middleware for admin authentication
const adminAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]; // Extract Bearer token

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Not authorized.' });
    }
    next();
  } catch (error) {
    console.error('Token verification error:', error.message);
    return res.status(400).json({ message: 'Invalid token.' });
  }
};

// Admin Login Route
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  // Check credentials
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    try {
      // Generate JWT token for admin
      const token = jwt.sign({ role: 'admin' }, ADMIN_JWT_SECRET, { expiresIn: '2h' });
      return res.status(200).json({ token, message: 'Login successful' });
    } catch (error) {
      console.error('Error generating token:', error.message);
      return res.status(500).json({ message: 'Internal server error' });
    }
  } else {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
});

// Endpoint to get total users
router.get('/total-users', adminAuth, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    res.status(200).json({ totalUsers });
  } catch (error) {
    console.error('Error fetching total users:', error.message);
    res.status(500).json({ message: 'Error fetching total users' });
  }
});

// Endpoint to get total vendors
router.get('/total-vendors', adminAuth, async (req, res) => {
  try {
    const totalVendors = await Vendor.countDocuments();
    res.status(200).json({ totalVendors });
  } catch (error) {
    console.error('Error fetching total vendors:', error.message);
    res.status(500).json({ message: 'Error fetching total vendors' });
  }
});

// Endpoint to get total quotes
router.get('/total-quotes', adminAuth, async (req, res) => {
  try {
    const totalQuotes = await QuoteRequest.countDocuments();
    res.status(200).json({ totalQuotes });
  } catch (error) {
    console.error('Error fetching total quotes:', error.message);
    res.status(500).json({ message: 'Error fetching total quotes' });
  }
});

// Endpoint to get total uploads
router.get('/total-uploads', adminAuth, async (req, res) => {
  try {
    const totalUploads = await UserDocument.countDocuments();
    res.status(200).json({ totalUploads });
  } catch (error) {
    console.error('Error fetching total uploads:', error.message);
    res.status(500).json({ message: 'Error fetching total uploads' });
  }
});

module.exports = router;
