import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { body, validationResult } from 'express-validator';
import vendorAuth from '../middleware/vendorAuth.js';
import Vendor from '../models/Vendor.js';
import QuoteRequest from '../models/QuoteRequest.js';
import Listing from '../models/Listing.js';
import Order from '../models/Order.js';
import Lead from '../models/Lead.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// ----------------------------------------------
// Configure Multer for File Uploads
// ----------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/vendors/';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'image/jpeg',
      'image/png',
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only PDF, Excel, CSV, and images are allowed.'), false);
    }
    cb(null, true);
  },
});

// ----------------------------------------------
// Vendor Signup Route
// ----------------------------------------------
router.post(
  '/signup',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('company').notEmpty().withMessage('Company name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('services')
      .isArray({ min: 1 })
      .withMessage('At least one service must be provided')
      .custom((services) => {
        const validServices = ['CCTV', 'Photocopiers', 'IT', 'Telecoms'];
        return services.every((service) => validServices.includes(service));
      })
      .withMessage('Invalid services provided'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, company, email, password, services } = req.body;

    try {
      const existingVendor = await Vendor.findOne({ email });
      if (existingVendor) {
        return res.status(400).json({ message: 'Vendor with this email already exists.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const newVendor = new Vendor({ name, company, email, password: hashedPassword, services });

      await newVendor.save();
      res.status(201).json({ message: 'Vendor registered successfully.' });
    } catch (error) {
      console.error('Error registering vendor:', error);
      res.status(500).json({ message: 'Internal server error.' });
    }
  }
);

// ----------------------------------------------
// Vendor Login Route
// ----------------------------------------------
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const vendor = await Vendor.findOne({ email });
    if (!vendor || !(await bcrypt.compare(password, vendor.password))) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    const token = jwt.sign({ vendorId: vendor._id }, process.env.JWT_SECRET, { expiresIn: '4h' });
    res.json({ token, vendorId: vendor._id, message: 'Login successful.' });
  } catch (error) {
    console.error('Error during vendor login:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// ----------------------------------------------
// Vendor Dashboard Route
// ----------------------------------------------
router.get('/dashboard', vendorAuth, async (req, res) => {
  try {
    const vendorId = req.vendorId;

    const totalRevenue = await QuoteRequest.aggregate([
      { $match: { vendor: mongoose.Types.ObjectId(vendorId), status: 'Won' } },
      { $group: { _id: null, total: { $sum: '$quoteValue' } } },
    ]);

    const activeListings = await Listing.countDocuments({ vendor: vendorId, isActive: true });
    const totalOrders = await Order.countDocuments({ vendor: vendorId });

    const revenueData = await QuoteRequest.aggregate([
      { $match: { vendor: mongoose.Types.ObjectId(vendorId), status: 'Won' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          revenue: { $sum: '$quoteValue' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const quoteFunnelData = await QuoteRequest.aggregate([
      { $match: { vendor: mongoose.Types.ObjectId(vendorId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const formattedQuoteFunnelData = quoteFunnelData.reduce(
      (acc, item) => {
        acc[item._id] = item.count || 0;
        return acc;
      },
      { created: 0, pending: 0, won: 0, lost: 0 }
    );

    const leads = await Lead.find({ vendor: vendorId }).lean();
    const vendor = await Vendor.findById(vendorId);
    const uploads = vendor?.uploads || [];

    res.status(200).json({
      kpis: {
        totalRevenue: totalRevenue.length > 0 ? totalRevenue[0].total : 0,
        activeListings,
        totalOrders,
      },
      revenueData,
      quoteFunnelData: formattedQuoteFunnelData,
      leads,
      uploads,
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

export default router;
