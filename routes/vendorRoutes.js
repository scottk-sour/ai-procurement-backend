// routes/vendorRoutes.js
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import multer from 'multer';

import Vendor from '../models/vendor.js';           // Your main Vendor model
import VendorDocument from '../models/vendorDocument.js'; // Storing vendor file data
import vendorAuth from '../middleware/vendorAuth.js';     // The vendorAuth middleware
import { extractFromPDF, extractFromCSV } from '../utils/fileProcessor.js'; 
// Or wherever you store your PDF/CSV extraction logic
// If you also handle Excel, import your excel logic similarly

dotenv.config();
const router = express.Router();

const { JWT_SECRET } = process.env;
if (!JWT_SECRET) {
  console.error('❌ ERROR: Missing JWT_SECRET in environment variables.');
  process.exit(1);
}

// ----------------------------------------------
// 🔹 Multer Setup for Vendor File Upload
// ----------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // You can separate vendor uploads, e.g. 'uploads/vendors'
    const documentType = req.body.documentType || 'others';
    const uploadPath = path.join('uploads', 'vendors', documentType);

    try {
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    } catch (err) {
      console.error('❌ Error creating upload directory:', err.message);
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
// 🔹 Vendor Registration (Signup)
// ----------------------------------------------
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, company, services = ['Photocopiers'] } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: '⚠ Name, email, and password are required.' });
    }

    // Check if vendor already exists
    const existingVendor = await Vendor.findOne({ email });
    if (existingVendor) {
      return res.status(400).json({ message: '⚠ Vendor already exists.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create vendor record
    const newVendor = new Vendor({
      name,
      email,
      password: hashedPassword, // stored as hashed
      company,
      services,                // Must match your schema constraints
    });
    await newVendor.save();

    res.status(201).json({ message: '✅ Vendor registered successfully.' });
  } catch (error) {
    console.error('❌ Error registering vendor:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

// ----------------------------------------------
// 🔹 Vendor Login
// ----------------------------------------------
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: '⚠ Email and password are required.' });
    }

    // Find vendor by email
    const vendor = await Vendor.findOne({ email });
    if (!vendor) {
      return res.status(401).json({ message: '❌ Invalid email or password.' });
    }

    // Compare submitted password to hashed password
    const isMatch = await bcrypt.compare(password, vendor.password);
    if (!isMatch) {
      return res.status(401).json({ message: '❌ Invalid email or password.' });
    }

    // Create JWT
    const token = jwt.sign(
      { vendorId: vendor._id, email: vendor.email },
      JWT_SECRET,
      { expiresIn: '4h' } // Adjust as you like
    );

    // (Optional) Store token in vendor doc if you want
    // vendor.token = token;
    // await vendor.save();

    res.json({
      token,
      vendorId: vendor._id,
      message: '✅ Vendor login successful.',
    });
  } catch (error) {
    console.error('❌ Error during vendor login:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

// ----------------------------------------------
// 🔹 Vendor Token Verification (Optional)
// ----------------------------------------------
router.get('/auth/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const vendor = await Vendor.findById(decoded.vendorId);
    if (!vendor) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    res.json({ authenticated: true, vendorId: vendor._id });
  } catch (error) {
    console.error('Vendor token verification error:', error.message);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
});

// ----------------------------------------------
// 🔹 Vendor File Upload (with AI Processing?)
// ----------------------------------------------
router.post('/upload', vendorAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: '⚠ No file uploaded or invalid file type.' });
  }

  const documentType = req.body.documentType || 'others';
  const filePath = req.file.path;
  let extractedData = {};

  try {
    // Here, we assume you might do some kind of PDF/CSV/Excel extraction
    if (req.file.mimetype === 'application/pdf') {
      extractedData = await extractFromPDF(filePath);
    } else if (req.file.mimetype.includes('spreadsheetml') || req.file.mimetype.includes('excel')) {
      extractedData = extractFromExcel(filePath); // or your own logic
    } else if (req.file.mimetype.includes('csv')) {
      extractedData = await extractFromCSV(filePath);
    } else {
      extractedData = { warning: 'Unsupported file format, skipping extraction' };
    }

    // Save document record in DB
    const newDocument = new VendorDocument({
      vendorId: req.vendorId,
      fileName: req.file.filename,
      filePath,
      documentType,
    });

    await newDocument.save();

    res.status(200).json({
      message: '✅ File uploaded and processed successfully.',
      filePath,
      documentType,
      extractedData,
    });
  } catch (error) {
    console.error('❌ Error during file processing:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

// ----------------------------------------------
// 🔹 Vendor Profile
// ----------------------------------------------
router.get('/profile', vendorAuth, async (req, res) => {
  try {
    // We have req.vendorId from vendorAuth
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
// 🔹 Fetch Vendor’s Uploaded Files
// ----------------------------------------------
router.get('/uploaded-files', vendorAuth, async (req, res) => {
  try {
    const files = await VendorDocument.find({ vendorId: req.vendorId });
    if (!files || files.length === 0) {
      return res.status(404).json({ message: '⚠ No uploaded files found for this vendor.' });
    }
    res.status(200).json({ files });
  } catch (error) {
    console.error('❌ Error fetching vendor files:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

// ----------------------------------------------
// 🔹 (Optional) Fetch Recent Vendor Activity
// ----------------------------------------------
router.get('/recent-activity', vendorAuth, async (req, res) => {
  try {
    // Example placeholder data or retrieve from a logs collection
    const recentActivity = [
      { description: 'Uploaded a file', date: new Date().toISOString() },
      { description: 'Edited a machine listing', date: new Date().toISOString() },
    ];

    res.status(200).json({ activities: recentActivity });
  } catch (error) {
    console.error('❌ Error fetching vendor activity:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

export default router;
