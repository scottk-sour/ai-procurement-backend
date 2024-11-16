const express = require('express');
const router = express.Router();
const multer = require('multer');
const vendorAuth = require('../middleware/vendorAuth');
const userAuth = require('../middleware/userAuth');
const Vendor = require('../models/Vendor');
const User = require('../models/User');

// Set up multer for file handling with dynamic folder selection
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (req.vendorId) {
      cb(null, 'uploads/vendors'); // Save vendor files in uploads/vendors
    } else if (req.userId) {
      cb(null, 'uploads/user'); // Save user files in uploads/user
    } else {
      cb(new Error('User type not specified'), null);
    }
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const upload = multer({ storage });

// Vendor file upload route
router.post('/vendor/upload', vendorAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    const vendor = await Vendor.findById(req.vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    
    vendor.uploads.push(req.file.path);
    await vendor.save();

    res.status(200).json({ message: 'Vendor file uploaded successfully', file: req.file });
  } catch (error) {
    console.error('Error uploading vendor file:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// User file upload route
router.post('/user/upload', userAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    user.uploads.push(req.file.path);
    await user.save();

    res.status(200).json({ message: 'User file uploaded successfully', file: req.file });
  } catch (error) {
    console.error('Error uploading user file:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
