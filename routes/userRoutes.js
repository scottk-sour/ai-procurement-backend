const express = require('express');
const router = express.Router();
const multer = require('multer');
const userAuth = require('../middleware/userAuth'); // Authentication middleware for users
const QuoteRequest = require('../models/QuoteRequest'); // Import the QuoteRequest model

// Configure storage for user uploads
const storage = multer.diskStorage({
  destination: 'uploads/users/', // Folder to store user files
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const upload = multer({ storage: storage });

// ----------------------------------------------
// Route 1: User File Upload
// ----------------------------------------------
router.post('/upload', userAuth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    res.status(200).json({
      message: 'File uploaded successfully',
      file: req.file,
    });
  } catch (error) {
    console.error('Error uploading user file:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ----------------------------------------------
// Route 2: Submit a Quote Request
// ----------------------------------------------
router.post('/request-quote', userAuth, async (req, res) => {
  const { productName, category, budget, features, description } = req.body;

  // Validate required fields
  if (!productName || !category || !budget) {
    return res.status(400).json({ message: 'Product name, category, and budget are required' });
  }

  try {
    // Create a new quote request
    const newRequest = new QuoteRequest({
      userId: req.userId,
      productName,
      category,
      budget,
      features,
      description,
    });

    // Save the quote request to the database
    await newRequest.save();

    res.status(201).json({ message: 'Quote request submitted successfully', request: newRequest });
  } catch (error) {
    console.error('Error submitting quote request:', error.message);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Export the router
module.exports = router;
