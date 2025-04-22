import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import csvParser from 'csv-parser';
import { body, validationResult } from 'express-validator';
import vendorAuth from '../middleware/vendorAuth.js';
import Vendor from "../models/Vendor.js";
import Machine from '../models/Machine.js';
import QuoteRequest from '../models/QuoteRequest.js';
import Listing from '../models/Listing.js';
import Order from '../models/Order.js';
import Lead from '../models/Lead.js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

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
    const allowedTypes = ['text/csv'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only CSV is allowed.'));
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
// ✅ Vendor Login Route (New)
// ----------------------------------------------
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      // Find vendor by email
      const vendor = await Vendor.findOne({ email }).lean();
      if (!vendor) {
        return res.status(401).json({ message: 'Invalid email or password.' });
      }

      // Check password
      const isMatch = await bcrypt.compare(password, vendor.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid email or password.' });
      }

      // Generate JWT token
      const token = jwt.sign(
        { vendorId: vendor._id, role: 'vendor' },
        process.env.JWT_SECRET,
        { expiresIn: '4h' }
      );

      res.status(200).json({
        message: 'Login successful',
        token,
        vendor: { id: vendor._id, email: vendor.email, company: vendor.company },
      });
    } catch (error) {
      console.error('Error during vendor login:', error.stack);
      res.status(500).json({ message: 'Internal server error.' });
    }
  }
);

// ----------------------------------------------
// ✅ Vendor Listings Routes
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

// ----------------------------------------------
// ✅ CSV Upload & Processing Route
// ----------------------------------------------
router.post('/upload', vendorAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded.' });
    }

    const vendor = await Vendor.findById(req.vendor._id);
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found.' });
    }

    const filePath = req.file.path;
    const machinesData = [];

    console.log("📂 Processing CSV file:", filePath);

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (row) => {
        console.log("📌 Parsed row:", row);

        if (row.model && row.type && row.lease_cost) {
          machinesData.push({
            vendorId: vendor._id,
            model: row.model.trim(),
            type: row.type.trim(),
            mono_cpc: row.mono_cpc ? parseFloat(row.mono_cpc) : 0,
            color_cpc: row.color_cpc ? parseFloat(row.color_cpc) : 0,
            lease_cost: parseFloat(row.lease_cost) || 0,
            services: row.services || '',
            provider: row.provider || '',
          });
        } else {
          console.warn("⚠ Skipping row due to missing fields:", row);
        }
      })
      .on('end', async () => {
        try {
          console.log("✅ Parsed Machines:", machinesData);

          if (machinesData.length === 0) {
            return res.status(400).json({ message: 'No valid machines found in CSV.' });
          }

          await Machine.insertMany(machinesData);
          vendor.uploads.push({
            fileName: req.file.filename,
            filePath,
            fileType: 'csv',
            uploadDate: new Date(),
          });
          await vendor.save();

          console.log("💾 Machines successfully saved.");
          res.status(201).json({
            message: '✅ File processed successfully.',
            machines: machinesData,
          });

        } catch (dbError) {
          console.error("❌ Database error:", dbError);
          res.status(500).json({ message: 'Database error while saving machines.' });
        }
      });

  } catch (error) {
    console.error("❌ File upload error:", error);
    res.status(500).json({ message: 'Error uploading file.' });
  }
});

// ----------------------------------------------
// ✅ Get Machines for a Vendor
// ----------------------------------------------
router.get('/machines', vendorAuth, async (req, res) => {
  try {
    const machines = await Machine.find({ vendorId: req.vendor._id }).lean();
    if (machines.length === 0) {
      return res.status(404).json({ message: 'No machines found for this vendor.' });
    }
    res.status(200).json(machines);
  } catch (error) {
    console.error("❌ Error fetching machines:", error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// ----------------------------------------------
// ✅ Vendor Dashboard Route
// ----------------------------------------------
router.get('/dashboard', vendorAuth, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendor._id).lean();
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found.' });
    }

    const machines = await Machine.find({ vendorId: vendor._id }).lean();
    res.status(200).json({ vendor, machines });
  } catch (error) {
    console.error('Error fetching dashboard data:', error.message);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

export default router;