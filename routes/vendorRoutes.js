import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { parse } from 'csv-parse';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import { isValidObjectId } from 'mongoose';
import Vendor from '../models/Vendor.js';
import VendorActivity from '../models/VendorActivity.js';
import CopierQuoteRequest from '../models/CopierQuoteRequest.js';
import AIRecommendationEngine from '../services/aiRecommendationEngine.js';
import vendorAuth from '../middleware/vendorAuth.js';

dotenv.config();
const router = express.Router();
const { JWT_SECRET } = process.env;

if (!JWT_SECRET) {
  console.error('❌ ERROR: Missing JWT_SECRET in environment variables.');
  process.exit(1);
}

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts. Please try again later.',
});
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many signup attempts. Please try again later.',
});
const recommendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many recommendation requests. Please try again later.',
});

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'uploads/vendors';
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`);
  },
});
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.pdf', '.csv', '.xlsx', '.xls', '.png', '.jpg', '.jpeg'];
  const ext = path.extname(file.originalname).toLowerCase();
  cb(null, allowedTypes.includes(ext));
};
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Vendor signup
router.post('/signup', signupLimiter, async (req, res) => {
  try {
    const { name, email, password, company, services = ['Photocopiers'] } = req.body;
    if (!name || !email || !password || !company) {
      return res.status(400).json({ message: 'Name, email, password, and company are required.' });
    }
    const existingVendor = await Vendor.findOne({ email });
    if (existingVendor) return res.status(400).json({ message: 'Vendor already exists.' });

    const hashedPassword = await bcrypt.hash(password, 12);
    const newVendor = new Vendor({
      name,
      email,
      password: hashedPassword,
      company,
      services,
      uploads: [],
      machines: [],
      status: 'active',
    });
    await newVendor.save();

    await VendorActivity.create({
      vendorId: newVendor._id,
      type: 'signup',
      description: 'Vendor account created',
    });

    res.status(201).json({ message: 'Vendor registered successfully.' });
  } catch (error) {
    console.error('❌ Error registering vendor:', error.message);
    res.status(500).json({ message: 'Internal server error.', error: error.message });
  }
});

// Vendor login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });
    const vendor = await Vendor.findOne({ email });
    if (!vendor) return res.status(401).json({ message: 'Invalid email or password.' });

    const isMatch = await bcrypt.compare(password, vendor.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid email or password.' });

    const token = jwt.sign(
      { vendorId: vendor._id.toString(), email: vendor.email, role: 'vendor' },
      JWT_SECRET,
      { expiresIn: '4h' }
    );

    await VendorActivity.create({
      vendorId: vendor._id,
      type: 'login',
      description: 'Vendor logged in',
    });

    res.json({
      token,
      vendorId: vendor._id.toString(),
      vendorName: vendor.name,
      message: 'Vendor login successful.',
    });
  } catch (error) {
    console.error('❌ Error during vendor login:', error.message);
    res.status(500).json({ message: 'Internal server error.', error: error.message });
  }
});

// Token verification
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided.' });

    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.vendorId) return res.status(401).json({ message: 'Invalid token payload.' });

    const vendor = await Vendor.findById(decoded.vendorId).select('-password');
    if (!vendor) return res.status(401).json({ message: 'Invalid token.' });

    res.json({
      message: 'Token is valid',
      vendor: {
        vendorId: vendor._id,
        vendorName: vendor.name,
        email: vendor.email,
      },
    });
  } catch (error) {
    console.error('❌ Vendor token verification error:', error.message);
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
});

// Vendor profile
router.get('/profile', vendorAuth, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendorId).select('-password');
    if (!vendor) return res.status(404).json({ message: 'Vendor not found.' });

    res.status(200).json({
      vendor: {
        vendorId: vendor._id,
        name: vendor.name,
        email: vendor.email,
        company: vendor.company,
        services: vendor.services,
        status: vendor.status,
        uploads: vendor.uploads,
      },
    });
  } catch (error) {
    console.error('❌ Error fetching vendor profile:', error.message);
    res.status(500).json({ message: 'Internal server error.', error: error.message });
  }
});

// ✅ Uploaded files – handles empty state correctly
router.get('/uploaded-files', vendorAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const vendor = await Vendor.findById(req.vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found.' });

    const startIndex = (page - 1) * limit;
    const files = (vendor.uploads || []).slice(startIndex, startIndex + parseInt(limit));
    res.status(200).json({ files });
  } catch (error) {
    console.error('❌ Error fetching vendor files:', error.message);
    res.status(500).json({ message: 'Internal server error.', error: error.message });
  }
});

// Recent activity
router.get('/recent-activity', vendorAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const activities = await VendorActivity.find({ vendorId: req.vendorId })
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    res.status(200).json({ activities });
  } catch (error) {
    console.error('❌ Error fetching vendor activity:', error.message);
    res.status(500).json({ message: 'Internal server error.', error: error.message });
  }
});

// ✅ NEW: Vendor notifications endpoint
router.get('/notifications', vendorAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    // For now, we'll create notifications from recent quote requests and activities
    // You can expand this to use a dedicated Notification model later
    
    const vendor = await Vendor.findById(req.vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found.' });

    // Get recent quote requests that might be relevant to this vendor
    const recentQuotes = await CopierQuoteRequest.find({
      // You might want to filter based on vendor services/location/etc.
      status: { $in: ['pending', 'active'] }
    })
    .sort({ createdAt: -1 })
    .limit(10);

    // Get recent vendor activities
    const recentActivities = await VendorActivity.find({ vendorId: req.vendorId })
      .sort({ date: -1 })
      .limit(10);

    // Create notifications array
    const notifications = [];

    // Add quote-based notifications
    recentQuotes.forEach(quote => {
      notifications.push({
        id: `quote-${quote._id}`,
        type: 'quote_opportunity',
        title: 'New Quote Opportunity',
        message: `New quote request for ${quote.copierType || 'equipment'} - ${quote.monthlyVolume || 'N/A'} pages/month`,
        timestamp: quote.createdAt,
        isRead: false,
        priority: 'medium',
        data: {
          quoteId: quote._id,
          companyName: quote.companyName,
          location: quote.location
        }
      });
    });

    // Add activity-based notifications
    recentActivities.forEach(activity => {
      if (activity.type === 'login') return; // Skip login activities for notifications
      
      notifications.push({
        id: `activity-${activity._id}`,
        type: 'activity',
        title: 'Account Activity',
        message: activity.description,
        timestamp: activity.date,
        isRead: true, // Mark activities as read
        priority: 'low',
        data: {
          activityType: activity.type
        }
      });
    });

    // Sort by timestamp and apply pagination
    notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const startIndex = (page - 1) * limit;
    const paginatedNotifications = notifications.slice(startIndex, startIndex + parseInt(limit));

    res.status(200).json({
      success: true,
      notifications: paginatedNotifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: notifications.length,
        hasMore: startIndex + parseInt(limit) < notifications.length
      },
      stats: {
        unreadCount: notifications.filter(n => !n.isRead).length,
        totalCount: notifications.length
      }
    });

  } catch (error) {
    console.error('❌ Error fetching vendor notifications:', error.message);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error.',
      error: error.message 
    });
  }
});

// ✅ NEW: Mark notification as read
router.patch('/notifications/:notificationId/read', vendorAuth, async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    // In a real implementation, you'd update the notification in the database
    // For now, we'll just return success
    
    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      notificationId
    });
  } catch (error) {
    console.error('❌ Error marking notification as read:', error.message);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error.',
      error: error.message 
    });
  }
});

// AI recommendations
router.get('/recommend', recommendLimiter, async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ message: 'Missing userId in query.' });
    if (!isValidObjectId(userId)) return res.status(400).json({ message: 'Invalid userId format.' });

    const quotes = await CopierQuoteRequest.find({ userId }).sort({ createdAt: -1 });
    if (!quotes.length) return res.status(404).json({ message: 'No quote requests found for this user.' });

    const recommendations = await AIRecommendationEngine.generateRecommendations(
      quotes[0],
      userId,
      []
    );

    res.status(200).json({ recommendations });
  } catch (error) {
    console.error('❌ Error in /recommend endpoint:', error.message);
    res.status(500).json({ message: 'Failed to get AI recommendations.', error: error.message });
  }
});

export default router;
