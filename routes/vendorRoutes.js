import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import Vendor from '../models/Vendor.js';
import VendorDocument from '../models/VendorDocument.js';
import VendorListing from '../models/VendorListing.js'; // Add this import
import vendorAuth from '../middleware/vendorAuth.js';
import { extractFromPDF, extractFromCSV } from '../utils/fileProcessor.js';

dotenv.config();

const router = express.Router();
const { JWT_SECRET } = process.env;

// ✅ Ensure JWT_SECRET is set in .env
if (!JWT_SECRET) {
  console.error("❌ ERROR: Missing JWT_SECRET in environment variables.");
  process.exit(1);
}

// ----------------------------------------------
// 🔹 Configure Multer for File Uploads
// ----------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const documentType = req.body.documentType || 'others';
    const uploadPath = path.join('uploads', 'vendors', documentType);

    try {
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    } catch (err) {
      console.error("❌ Error creating upload directory:", err.message);
      cb(new Error('⚠ Server error while setting up upload directory.'));
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('⚠ Invalid file type. Only PDF, Excel, and CSV are allowed.'), false);
    }
    cb(null, true);
  },
});

// ----------------------------------------------
// 🔹 Vendor Token Verification Route
// ----------------------------------------------
router.get('/auth/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]; // Extract token from "Bearer <token>"
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    // Verify token using your JWT secret
    const decoded = jwt.verify(token, JWT_SECRET);
    const vendor = await Vendor.findById(decoded.vendorId); // Adjust based on your token payload

    if (!vendor) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    res.json({ authenticated: true, vendorId: decoded.vendorId });
  } catch (error) {
    console.error('Token verification error:', error.message);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
});

// ----------------------------------------------
// 🔹 Vendor Registration Route
// ----------------------------------------------
router.post('/signup', async (req, res) => {
  const { name, email, password, company } = req.body;

  if (!name || !email || !password || !company) {
    return res.status(400).json({ message: '⚠ Name, email, password, and company are required.' });
  }

  try {
    const existingVendor = await Vendor.findOne({ email });
    if (existingVendor) {
      return res.status(400).json({ message: '⚠ Vendor already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newVendor = new Vendor({ name, email, password: hashedPassword, company });
    await newVendor.save();

    res.status(201).json({ message: '✅ Vendor registered successfully.' });
  } catch (error) {
    console.error('❌ Error registering vendor:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

// ----------------------------------------------
// 🔹 Vendor Login Route
// ----------------------------------------------
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: '⚠ Email and password are required.' });
  }

  try {
    const vendor = await Vendor.findOne({ email });
    if (!vendor || !(await bcrypt.compare(password, vendor.password))) {
      return res.status(401).json({ message: '❌ Invalid email or password.' });
    }

    const token = jwt.sign({ vendorId: vendor._id }, JWT_SECRET, { expiresIn: '4h' });

    res.json({ token, vendorId: vendor._id, message: '✅ Login successful.' });
  } catch (error) {
    console.error('❌ Error during vendor login:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

// ----------------------------------------------
// 🔹 Vendor File Upload Route with AI Processing
// ----------------------------------------------
router.post('/upload', vendorAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: '⚠ No file uploaded or invalid file type.' });
  }

  const documentType = req.body.documentType || 'others';
  const filePath = req.file.path;
  let extractedData = {};

  try {
    const vendor = await Vendor.findById(req.vendorId);
    if (!vendor) {
      return res.status(404).json({ message: '⚠ Vendor not found.' });
    }

    // Process the uploaded file based on its type
    if (req.file.mimetype === 'application/pdf') {
      extractedData = await extractFromPDF(filePath);
    } else if (req.file.mimetype.includes('spreadsheetml') || req.file.mimetype.includes('excel')) {
      extractedData = extractFromExcel(filePath);
    } else if (req.file.mimetype.includes('csv')) {
      extractedData = await extractFromCSV(filePath);
    } else {
      extractedData = { error: 'Unsupported file format' };
    }

    const newDocument = new VendorDocument({
      vendorId: req.vendorId,
      fileName: req.file.filename,
      filePath: req.file.path,
      uploadDate: new Date(),
      documentType,
    });

    await newDocument.save();

    res.status(200).json({
      message: '✅ File uploaded and processed successfully.',
      filePath: req.file.path,
      documentType,
      extractedData,
    });
  } catch (error) {
    console.error('❌ Error during file processing:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

// ----------------------------------------------
// 🔹 Fetch Vendor Profile Route
// ----------------------------------------------
router.get('/profile', vendorAuth, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendorId).select('-password');

    if (!vendor) {
      return res.status(404).json({ message: '⚠ Vendor not found.' });
    }

    res.status(200).json({ vendor });
  } catch (error) {
    console.error('❌ Error fetching vendor profile:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

// ----------------------------------------------
// 🔹 Fetch Vendor Listings Route
// ----------------------------------------------
router.get('/listings', vendorAuth, async (req, res) => {
  try {
    const listings = await VendorListing.find({ vendorId: req.vendorId });
    if (!listings || listings.length === 0) {
      return res.status(404).json({ message: '⚠ No listings found.' });
    }
    res.status(200).json({ listings });
  } catch (error) {
    console.error('❌ Error fetching vendor listings:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

export default router;