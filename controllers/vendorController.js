import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import { body, validationResult } from 'express-validator';
import vendorAuth from '../middleware/vendorAuth.js';
import Vendor from '../models/Vendor.js';
import Machine from '../models/Machine.js';
import Listing from '../models/Listing.js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const BCRYPT_COST = 12;

// ========== Multer Config ==========
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/vendors/';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const valid = ['text/csv', 'application/vnd.ms-excel'].includes(file.mimetype);
    cb(valid ? null : new Error('Only CSV files allowed'), valid);
  },
});

// ========== Vendor Signup ==========
router.post('/signup', [
  body('name').notEmpty(),
  body('company').notEmpty(),
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
  body('services').isArray({ min: 1 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, company, email, password, services } = req.body;
  try {
    const existingVendor = await Vendor.findOne({ email: email.toLowerCase() });
    if (existingVendor) return res.status(400).json({ message: 'Vendor already exists.' });

    const hashedPassword = await bcrypt.hash(password, BCRYPT_COST);
    const newVendor = new Vendor({
      name, company, email: email.toLowerCase(), password: hashedPassword, services
    });
    await newVendor.save();
    res.status(201).json({ message: 'Vendor registered successfully.' });
  } catch (err) {
    console.error('❌ Signup Error:', err.message);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// ========== Vendor Login ==========
router.post('/login', [
  body('email').isEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;
  try {
    const vendor = await Vendor.findOne({ email: email.toLowerCase() });
    if (!vendor) return res.status(401).json({ message: 'Invalid email or password.' });

    const isMatch = await vendor.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid email or password.' });

    const token = jwt.sign({ vendorId: vendor._id, role: 'vendor' }, JWT_SECRET, { expiresIn: '4h' });
    res.status(200).json({
      message: 'Login successful',
      token,
      vendor: {
        id: vendor._id,
        name: vendor.name,
        company: vendor.company,
        email: vendor.email,
      },
    });
  } catch (err) {
    console.error('❌ Login Error:', err.message);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// ========== Listing Management ==========
router.get('/listings', vendorAuth, async (req, res) => {
  try {
    const listings = await Listing.find({ vendor: req.vendor._id });
    res.status(200).json(listings);
  } catch (err) {
    res.status(500).json({ message: 'Internal server error.' });
  }
});

router.post('/listings', vendorAuth, async (req, res) => {
  const { name, category, price, status = 'Active' } = req.body;
  if (!name || !category || !price) return res.status(400).json({ message: 'Missing fields.' });

  try {
    const newListing = new Listing({ vendor: req.vendor._id, name, category, price, status });
    await newListing.save();
    res.status(201).json(newListing);
  } catch (err) {
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// ========== CSV Upload ==========
router.post('/upload', vendorAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });

  try {
    const machines = [];
    fs.createReadStream(req.file.path)
      .pipe(csvParser())
      .on('data', row => {
        if (row.model && row.type && row.lease_cost) {
          machines.push({
            vendorId: req.vendor._id,
            model: row.model,
            type: row.type,
            mono_cpc: parseFloat(row.mono_cpc || 0),
            color_cpc: parseFloat(row.color_cpc || 0),
            lease_cost: parseFloat(row.lease_cost),
            services: row.services || '',
            provider: row.provider || '',
          });
        }
      })
      .on('end', async () => {
        if (!machines.length) return res.status(400).json({ message: 'No valid data in CSV.' });
        await Machine.insertMany(machines);
        const vendor = await Vendor.findById(req.vendor._id);
        vendor.uploads.push({ fileName: req.file.filename, filePath: req.file.path, fileType: 'csv' });
        await vendor.save();
        res.status(201).json({ message: 'Upload complete.', machines });
      })
      .on('error', err => {
        console.error('❌ CSV Error:', err);
        res.status(500).json({ message: 'CSV parsing error.' });
      });
  } catch (err) {
    res.status(500).json({ message: 'Server error during file processing.' });
  }
});

// ========== Vendor Dashboard ==========
router.get('/dashboard', vendorAuth, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendor._id);
    const machines = await Machine.find({ vendorId: req.vendor._id });
    res.status(200).json({ vendor, machines });
  } catch (err) {
    res.status(500).json({ message: 'Dashboard fetch error.' });
  }
});

export default router;
