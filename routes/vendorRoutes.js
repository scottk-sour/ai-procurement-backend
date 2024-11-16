// routes/vendorRoutes.js

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const vendorAuth = require('../middleware/vendorAuth');
const Vendor = require('../models/Vendor');

// Configure storage for vendor uploads
const storage = multer.diskStorage({
  destination: 'uploads/vendors/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

// Initialize multer with storage configuration
const upload = multer({
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 5 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type'), false);
    }
    cb(null, true);
  },
});

// POST /api/vendors/signup - Vendor signup route
router.post('/signup', async (req, res) => {
  const { name, company, email, password, services } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required' });
  }

  try {
    const existingVendor = await Vendor.findOne({ email });
    if (existingVendor) {
      return res.status(400).json({ message: 'Vendor already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newVendor = new Vendor({ name, company, email, password: hashedPassword, services });
    await newVendor.save();

    res.status(201).json({ message: 'Vendor registered successfully' });
  } catch (error) {
    console.error('Error registering vendor:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/vendors/login - Vendor login route
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const vendor = await Vendor.findOne({ email });
    if (!vendor) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, vendor.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign({ vendorId: vendor._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, vendorId: vendor._id, message: 'Login successful' });
  } catch (error) {
    console.error('Error during vendor login:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/vendors/upload - Vendor file upload route
router.post('/upload', vendorAuth, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded or invalid file type' });
  }

  try {
    res.status(200).json({
      message: 'File uploaded successfully',
      file: req.file,
    });
  } catch (error) {
    console.error('Error uploading vendor file:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
