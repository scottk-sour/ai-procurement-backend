import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import User from '../models/User.js';
import UserDocument from '../models/UserDocument.js';
import userAuth from '../middleware/userAuth.js';
import { extractFromPDF, extractFromExcel, extractFromCSV } from '../utils/fileProcessor.js';

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

// ----------------------------------------------
// 🔹 User Registration Route
// ----------------------------------------------
router.post('/signup', async (req, res) => {
  const { name, email, password, company } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: '⚠ Name, email, and password are required.' });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: '⚠ User already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = new User({ name, email, password: hashedPassword, company });
    await newUser.save();

    res.status(201).json({ message: '✅ User registered successfully.' });
  } catch (error) {
    console.error('❌ Error registering user:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

// ----------------------------------------------
// 🔹 User Login Route
// ----------------------------------------------
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: '⚠ Email and password are required.' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: '❌ Invalid email or password.' });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '4h' });

    res.json({ token, userId: user._id, message: '✅ Login successful.' });
  } catch (error) {
    console.error('❌ Error during user login:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

// ----------------------------------------------
// 🔹 User File Upload Route with AI Processing
// ----------------------------------------------
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

// ----------------------------------------------
// 🔹 Fetch User Profile Route
// ----------------------------------------------
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

// ----------------------------------------------
// 🔹 Fetch Uploaded Files Route
// ----------------------------------------------
router.get('/uploaded-files', userAuth, async (req, res) => {
  try {
    const files = await UserDocument.find({ userId: req.userId });
    if (!files || files.length === 0) {
      return res.status(404).json({ message: '⚠ No uploaded files found.' });
    }
    res.status(200).json({ files });
  } catch (error) {
    console.error('❌ Error fetching uploaded files:', error.message);
    res.status(500).json({ message: '❌ Internal server error.', error: error.message });
  }
});

// ----------------------------------------------
// 🔹 Fetch Recent Activity Route
// ----------------------------------------------
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
