// routes/userRoutes.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const userAuth = require('../middleware/userAuth'); // Authentication middleware for users

// Configure storage for user uploads
const storage = multer.diskStorage({
  destination: 'uploads/users/', // Folder to store user files
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const upload = multer({ storage: storage });

// POST /api/users/upload - User file upload route
router.post('/upload', userAuth, upload.single('file'), (req, res) => {
  try {
    // The uploaded file is available as req.file
    res.status(200).json({
      message: 'File uploaded successfully',
      file: req.file,
    });
  } catch (error) {
    console.error('Error uploading user file:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Export the router
module.exports = router;
