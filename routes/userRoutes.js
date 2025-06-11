// routes/userRoutes.js
import express from 'express';
import jwt from 'jsonwebtoken';
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

// --- Multer setup ---
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
      cb(new Error('Server error while setting up upload directory.'));
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
    cb(null, uniqueName);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only PDF, Excel, and CSV are allowed.'), false);
    }
    cb(null, true);
  },
});

// --- ROUTES ---

// Token verification (for use in frontend AuthContext)
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId || decoded.id);
    if (!user) return res.status(401).json({ message: 'Invalid token' });

    res.json({
      message: 'Token is valid',
      user: {
        userId: user._id,
        role: user.role || 'user',
        name: user.name,
        email: user.email,
        company: user.company || null, // Only if you have company on the model
      },
    });
  } catch (error) {
    console.error('Token verification error:', error.message);
    res.status(401).json({ message: 'Invalid or expired token' });
  }
});

// User sign-up (force role = user)
router.post('/signup', async (req, res) => {
  req.body.role = 'user';
  return signup(req, res);
});

// User login
router.post('/login', (req, res) => login(req, res));

// Dummy savings (replace with actual logic later)
router.get('/savings', userAuth, (req, res) => {
  const dummy = { estimatedMonthlySavings: 42.5, estimatedAnnualSavings: 510.0 };
  res.json(dummy);
});

// File upload + AI processing
router.post('/upload', userAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded or invalid file type.' });
  }

  const { documentType = 'others' } = req.body;
  const filePath = req.file.path;
  let extractedData = {};

  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    if (req.file.mimetype === 'application/pdf') {
      extractedData = await extractFromPDF(filePath);
    } else if (req.file.mimetype.includes('spreadsheetml') || req.file.mimetype.includes('excel')) {
      extractedData = await extractFromExcel(filePath);
    } else if (req.file.mimetype.includes('csv')) {
      extractedData = await extractFromCSV(filePath);
    } else {
      extractedData = { error: 'Unsupported file format' };
    }

    const doc = new UserDocument({
      userId: req.userId,
      fileName: req.file.filename,
      filePath,
      uploadDate: new Date(),
      documentType,
    });
    await doc.save();

    res.json({
      message: 'File uploaded and processed successfully.',
      filePath,
      documentType,
      extractedData,
    });
  } catch (err) {
    console.error('❌ Error during file processing:', err.message);
    res.status(500).json({ message: 'Internal server error.', error: err.message });
  }
});

// Get user profile
router.get('/profile', userAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({
      user: {
        userId: user._id,
        role: user.role || 'user',
        name: user.name,
        email: user.email,
        company: user.company || null, // Optional, if present on your model
      },
    });
  } catch (err) {
    console.error('❌ Error fetching user profile:', err.message);
    res.status(500).json({ message: 'Internal server error.', error: err.message });
  }
});

// Get uploaded files for user
router.get('/uploaded-files', userAuth, async (req, res) => {
  try {
    const files = await UserDocument.find({ userId: req.userId });
    res.json({ files, message: files.length ? undefined : 'No uploaded files found.' });
  } catch (err) {
    console.error('❌ Error fetching uploaded files:', err.message);
    res.status(500).json({ message: 'Internal server error.', error: err.message });
  }
});

// Dummy recent activity (replace with real activity feed in the future)
router.get('/recent-activity', userAuth, (req, res) => {
  const now = new Date().toISOString();
  res.json({
    activities: [
      { description: 'Uploaded a document', date: now },
      { description: 'Requested a quote', date: now },
    ],
  });
});

export default router;
