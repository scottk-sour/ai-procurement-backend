import express from 'express';
import bcrypt from 'bcrypt'; // Kept for potential future use
import jwt from 'jsonwebtoken'; // Kept for verify route
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import User from '../models/User.js';
import UserDocument from '../models/UserDocument.js';
import userAuth from '../middleware/userAuth.js';
import { extractFromPDF, extractFromCSV, extractFromExcel } from '../utils/fileProcessor.js';
import { login, signup } from '../controllers/userController.js';

dotenv.config();

const router = express.Router();
const { JWT_SECRET } = process.env;

if (!JWT_SECRET) {
  console.error("❌ ERROR: Missing JWT_SECRET in environment variables.");
  process.exit(1);
}

// Configure Multer for File Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const documentType = req.body.documentType || 'others';
    const uploadPath = path.join('uploads', 'users', documentType);

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

// User Token Verification Route
router.get('/auth/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    res.json({ authenticated: true, userId: decoded.userId, role: user.role });
  } catch (error) {
    console.error('Token verification error:', error.message);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
});

// User Registration Route (Override default role to "user")
router.post('/signup', async (req, res) => {
  const { name, email, password, company, role = 'user' } = req.body;
  req.body.role = 'user'; // Force user role
  return signup(req, res);
});

// User Login Route (Override role to "user" if needed)
router.post('/login', async (req, res) => {
  // Delegate to UserController.js login
  await login(req, res);
  // Note: Role is set in UserController.js as 'user'
});

// NEW: Fetch User Savings Route
router.get('/savings', userAuth, async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Dummy savings data; replace with actual calculation logic as needed
    const dummySavings = {
      estimatedMonthlySavings: 42.50,
      estimatedAnnualSavings: 510.00
    };

    return res.status(200).json(dummySavings);
  } catch (error) {
    console.error('Error fetching user savings:', error.message);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// User File Upload Route with AI Processing
router.post('/upload', userAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: '⚠ No file uploaded or invalid file type.' });
  }

  const documentType = req.body.documentType || 'others';
  const filePath = req.file.path;
  let extractedData = {};

  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: '⚠ User not found.' });
    }

    if (req.file.mimetype === 'application/pdf') {
      extractedData = await extractFromPDF(filePath);
    } else if (req.file.mimetype.includes('spreadsheetml') || req.file.mimetype.includes('excel')) {
      extractedData = await extractFromExcel(filePath);
    } else if (req.file.mimetype.includes('csv')) {
      extractedData = await extractFromCSV(filePath);
    } else {
      extractedData = { error: 'Unsupported file format' };
    }

    const newDocument = new UserDocument({
      userId: req.userId,
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

// Fetch User Profile Route
router.get('/profile', userAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: '⚠ User not found.' });
    }
    res.status(200).json({ user });
  } catch (error) {
    console.error('❌ Error fetching user profile:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

// Fetch Uploaded Files Route
router.get('/uploaded-files', userAuth, async (req, res) => {
  try {
    const files = await UserDocument.find({ userId: req.userId });
    if (!files || files.length === 0) {
      return res.status(200).json({ files: [], message: 'No uploaded files found.' });
    }
    res.status(200).json({ files });
  } catch (error) {
    console.error('❌ Error fetching uploaded files:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

// Fetch Recent Activity Route
router.get('/recent-activity', userAuth, async (req, res) => {
  try {
    const recentActivity = [
      { description: 'Uploaded a document', date: new Date().toISOString() },
      { description: 'Requested a quote', date: new Date().toISOString() },
    ];
    res.status(200).json({ activities: recentActivity });
  } catch (error) {
    console.error('❌ Error fetching recent activity:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

export default router;
