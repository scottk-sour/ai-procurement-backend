// routes/vendorRoutes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const vendorAuth = require('../middleware/vendorAuth');
const Vendor = require('../models/Vendor');
const fs = require('fs');

// Configure storage for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/vendors/';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 10 }, // 10MB limit
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
      return cb(new Error('Invalid file type. Only PDF, Excel, CSV, and images are allowed'), false);
    }
    cb(null, true);
  },
});

// Vendor Signup Route
router.post('/signup', async (req, res) => {
  console.log('Received payload:', req.body); // Debugging log
  const { name, company, email, password, services } = req.body;

  // Validate required fields
  if (!name || !company || !email || !password || !services) {
    return res.status(400).json({ message: 'All fields (name, company, email, password, services) are required.' });
  }

  if (!Array.isArray(services) || services.length === 0) {
    return res.status(400).json({ message: 'Services must be a non-empty array of valid service names.' });
  }

  try {
    const existingVendor = await Vendor.findOne({ email });
    if (existingVendor) {
      return res.status(400).json({ message: 'Vendor with this email already exists.' });
    }

    const validServices = ['CCTV', 'Photocopiers', 'IT', 'Telecoms'];
    const isValidServices = services.every(service => validServices.includes(service));
    if (!isValidServices) {
      return res.status(400).json({ message: 'Invalid services provided. Allowed values are: CCTV, Photocopiers, IT, Telecoms.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newVendor = new Vendor({
      name,
      company,
      email,
      password: hashedPassword,
      services,
    });

    await newVendor.save();
    res.status(201).json({ message: 'Vendor registered successfully.' });
  } catch (error) {
    console.error('Error registering vendor:', error.message, error.stack);
    res.status(500).json({ message: 'Internal server error.', error: error.message });
  }
});

// Vendor Login Route
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
    console.error('Error during vendor login:', error.message, error.stack);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Unified Upload Route
router.post('/upload', vendorAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded or invalid file type.' });
  }

  try {
    const vendor = await Vendor.findById(req.vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found.' });

    vendor.uploads.push(req.file.path);
    await vendor.save();

    res.status(200).json({ message: 'File uploaded successfully.', filePath: req.file.path });
  } catch (error) {
    console.error('Error uploading file:', error.message, error.stack);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// Fetch Vendor Profile
router.get('/profile', vendorAuth, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found.' });
    res.status(200).json({ vendor });
  } catch (error) {
    console.error('Error fetching vendor profile:', error.message, error.stack);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

module.exports = router;
