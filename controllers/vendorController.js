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
// ✅ Helper function to determine fileType
// ----------------------------------------------
const getFileType = (file) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (ext === '.csv') return 'csv';
  if (ext === '.xls' || ext === '.xlsx') return 'excel';
  if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) return 'image';
  return 'unknown';
};

// ----------------------------------------------
// ✅ Configure Multer for File Uploads
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
      return cb(new Error('Invalid file type. Only PDF, Excel, CSV, and images are allowed.'));
    }
    cb(null, true);
  },
});

// ----------------------------------------------
// ✅ Vendor Signup Route
// ----------------------------------------------
router.post(
  '/signup',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('company').notEmpty().withMessage('Company name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('services').isArray({ min: 1 }).withMessage('At least one service must be provided'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, company, email, password, services } = req.body;

    try {
      const existingVendor = await Vendor.findOne({ email }).lean();
      if (existingVendor) {
        return res.status(400).json({ message: 'Vendor with this email already exists.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const newVendor = new Vendor({ name, company, email, password: hashedPassword, services, status: 'active' });

      await newVendor.save();
      res.status(201).json({ message: 'Vendor registered successfully.' });
    } catch (error) {
      console.error('Error registering vendor:', error.message);
      res.status(500).json({ message: 'Internal server error.' });
    }
  }
);

// ----------------------------------------------
// ✅ Vendor Listings Routes (Fixes Missing `/listings` Route)
// ----------------------------------------------
router.get('/listings', vendorAuth, async (req, res) => {
  try {
    const listings = await Listing.find({ vendor: req.vendor._id }).lean();
    res.status(200).json(listings);
  } catch (error) {
    console.error('Error fetching listings:', error.message);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

router.post('/listings', vendorAuth, async (req, res) => {
  try {
    if (req.vendor.status !== 'active') {
      return res.status(403).json({ message: 'Vendor account is inactive.' });
    }

    const { name, category, price, status } = req.body;
    if (!name || !category || !price) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const newListing = new Listing({ vendor: req.vendor._id, name, category, price, status: status || 'Active' });
    await newListing.save();

    res.status(201).json(newListing);
  } catch (error) {
    console.error('Error creating listing:', error.message);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

router.delete('/listings/:id', vendorAuth, async (req, res) => {
  try {
    const deletedListing = await Listing.findOneAndDelete({ _id: req.params.id, vendor: req.vendor._id });
    if (!deletedListing) {
      return res.status(404).json({ message: 'Listing not found or unauthorized.' });
    }
    res.status(200).json({ message: 'Listing deleted successfully.' });
  } catch (error) {
    console.error('Error deleting listing:', error.message);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// ----------------------------------------------
// ✅ Vendor Dashboard Route
// ----------------------------------------------
router.get('/dashboard', vendorAuth, async (req, res) => {
  try {
    const vendorId = req.vendor._id;

    const totalRevenue = await QuoteRequest.aggregate([
      { $match: { vendor: mongoose.Types.ObjectId(vendorId), status: 'Won' } },
      { $group: { _id: null, total: { $sum: '$quoteValue' } } },
    ]);

    const activeListings = await Listing.countDocuments({ vendor: vendorId, isActive: true });
    const totalOrders = await Order.countDocuments({ vendor: vendorId });

    const quoteFunnelData = await QuoteRequest.aggregate([
      { $match: { vendor: mongoose.Types.ObjectId(vendorId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const leads = await Lead.find({ vendor: vendorId }).lean();
    const uploads = req.vendor?.uploads || [];

    res.status(200).json({
      kpis: {
        totalRevenue: totalRevenue.length > 0 ? totalRevenue[0].total : 0,
        activeListings,
        totalOrders,
      },
      quoteFunnelData,
      leads,
      uploads,
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error.message);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

export default router;
