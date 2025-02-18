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
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

// -------------------------------------------------
// 🔹 Helper: Get File Type from Extension
// -------------------------------------------------
const getFileType = (file) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (ext === '.csv') return 'csv';
  if (ext === '.xls' || ext === '.xlsx') return 'excel';
  if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) return 'image';
  return 'unknown';
};

// -------------------------------------------------
// 🔹 Configure Multer for File Uploads
// -------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/vendors/';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: async (req, file, cb) => {
    try {
      const vendorId = req.vendorId;
      const vendor = await Vendor.findById(vendorId);
      if (!vendor) {
        return cb(new Error('Vendor not found'));
      }

      const companyName = vendor.company.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
      const newFileName = `${companyName}${path.extname(file.originalname)}`;
      const filePath = path.join('uploads/vendors', newFileName);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      cb(null, newFileName);
    } catch (error) {
      cb(error);
    }
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

// -------------------------------------------------
// 🔹 Vendor Dashboard Route (GET /api/vendors/dashboard)
// -------------------------------------------------
router.get('/dashboard', vendorAuth, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendorId).select('-password');
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found.' });
    }
    res.json({
      companyName: vendor.company,
      email: vendor.email,
      uploads: vendor.uploads,
      kpis: {
        totalRevenue: vendor.totalRevenue || 0,
        activeListings: vendor.activeListings || 0,
        totalOrders: vendor.totalOrders || 0,
      },
      quoteFunnelData: {
        created: vendor.quotesCreated || 0,
        pending: vendor.quotesPending || 0,
        won: vendor.quotesWon || 0,
        lost: vendor.quotesLost || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching vendor dashboard:', error.message);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// -------------------------------------------------
// 🔹 Vendor Signup Route
// -------------------------------------------------
router.post(
  '/signup',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('company').notEmpty().withMessage('Company name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, company, email, password } = req.body;

    try {
      const existingVendor = await Vendor.findOne({ email });
      if (existingVendor) {
        return res.status(400).json({ message: 'Vendor with this email already exists.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const newVendor = new Vendor({ name, company, email, password: hashedPassword });

      await newVendor.save();
      res.status(201).json({ message: 'Vendor registered successfully.' });
    } catch (error) {
      console.error('❌ Error registering vendor:', error.message);
      res.status(500).json({ message: 'Internal server error.' });
    }
  }
);

// -------------------------------------------------
// 🔹 Vendor Login Route
// -------------------------------------------------
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
    console.error('❌ Error during vendor login:', error.message);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// -------------------------------------------------
// 🔹 Vendor File Upload Route
// -------------------------------------------------
router.post('/upload', vendorAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded.' });
    }

    const vendorId = req.vendorId;
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found.' });
    }

    const fileType = getFileType(req.file);
    if (fileType === 'unknown') {
      return res.status(400).json({ message: 'Unsupported file type.' });
    }

    vendor.uploads.push({
      fileName: req.file.filename,
      filePath: req.file.path,
      uploadDate: new Date(),
      fileType,
    });

    await vendor.save();

    res.status(200).json({ message: 'File uploaded successfully.', vendor });
  } catch (error) {
    console.error('Error during file upload:', error.message);
    res.status(500).json({ message: 'Internal server error during file upload.' });
  }
});

export default router;
