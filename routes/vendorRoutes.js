const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const vendorAuth = require('../middleware/vendorAuth');
const Vendor = require('../models/Vendor');
const Product = require('../models/Product');

// Configure storage for vendor uploads (PDFs, images, etc.)
const storage = multer.diskStorage({
  destination: 'uploads/vendors/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 5 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type'), false);
    }
    cb(null, true);
  }
});

// Configure storage for product data uploads (CSV/Excel)
const productUpload = multer({
  dest: 'uploads/vendors/products/',
  limits: { fileSize: 1024 * 1024 * 10 }
});

// Vendor Signup Route
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

// Vendor Login Route
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }
  try {
    const vendor = await Vendor.findOne({ email });
    if (!vendor || !(await bcrypt.compare(password, vendor.password))) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }
    const token = jwt.sign({ vendorId: vendor._id }, process.env.JWT_SECRET, { expiresIn: '4h' });
    res.json({ token, vendorId: vendor._id, message: 'Login successful' });
  } catch (error) {
    console.error('Error during vendor login:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Vendor File Upload Route (PDF, Images)
router.post('/upload', vendorAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded or invalid file type' });
  }
  try {
    const vendor = await Vendor.findById(req.vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    vendor.uploads.push(req.file.path);
    await vendor.save();
    res.status(200).json({ message: 'File uploaded successfully', file: req.file });
  } catch (error) {
    console.error('Error uploading file:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Fetch Vendor Profile
router.get('/profile', vendorAuth, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    res.status(200).json({ vendor });
  } catch (error) {
    console.error('Error fetching vendor profile:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Upload Products (CSV/Excel)
router.post('/upload-products', vendorAuth, productUpload.single('file'), async (req, res) => {
  console.log('Headers:', req.headers);
  console.log('Vendor ID from token:', req.vendorId);

  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const vendorId = req.vendorId;
  const filePath = path.join(__dirname, '..', req.file.path);
  const products = [];

  console.log('File Path:', filePath);
  console.log('File MIME Type:', req.file.mimetype);

  try {
    if (req.file.mimetype === 'text/csv') {
      console.log('Parsing CSV file...');
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          products.push({
            vendorId,
            productName: row.productName,
            category: row.category,
            description: row.description,
            price: parseFloat(row.price),
            features: row.features ? row.features.split(',') : []
          });
        })
        .on('end', async () => {
          await Product.insertMany(products);
          res.status(200).json({ message: 'Products uploaded successfully (CSV)', products });
        })
        .on('error', (err) => {
          console.error('Error reading CSV file:', err.message);
          res.status(500).json({ message: 'Error parsing CSV file', error: err.message });
        });

    } else if (req.file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      console.log('Parsing Excel file...');
      const workbook = xlsx.readFile(filePath);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(worksheet);
      rows.forEach(row => {
        products.push({
          vendorId,
          productName: row.productName,
          category: row.category,
          description: row.description,
          price: parseFloat(row.price),
          features: row.features ? row.features.split(',') : []
        });
      });
      await Product.insertMany(products);
      res.status(200).json({ message: 'Products uploaded successfully (Excel)', products });
    } else {
      return res.status(400).json({ message: 'Unsupported file type' });
    }
  } catch (error) {
    console.error('Error uploading products:', error.message);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

module.exports = router;
