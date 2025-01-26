import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'fs';
import User from '../models/User.js';
import UserDocument from '../models/UserDocument.js';
import userAuth from '../middleware/userAuth.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const { JWT_SECRET } = process.env;

// ----------------------------------------------
// Configure Multer for File Uploads
// ----------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const documentType = req.body.documentType || 'others';

    let uploadPath = 'uploads/users/';
    if (documentType === 'contract') {
      uploadPath += 'contracts/';
    } else if (documentType === 'bill') {
      uploadPath += 'bills/';
    } else {
      uploadPath += 'others/';
    }

    fs.mkdirSync(uploadPath, { recursive: true }); // Ensure the directory exists
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only PDF, Excel, and CSV are allowed'), false);
    }
    cb(null, true);
  },
});

// ----------------------------------------------
// User Registration Route
// ----------------------------------------------
router.post('/signup', async (req, res) => {
  const { name, email, password, company } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required' });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashedPassword, company });
    await newUser.save();

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Error registering user:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ----------------------------------------------
// User Login Route
// ----------------------------------------------
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '4h' });

    res.json({ token, userId: user._id, message: 'Login successful' });
  } catch (error) {
    console.error('Error during user login:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ----------------------------------------------
// User File Upload Route
// ----------------------------------------------
router.post('/upload', userAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded or invalid file type' });
  }

  const documentType = req.body.documentType || 'others';

  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const newDocument = new UserDocument({
      userId: req.userId,
      fileName: req.file.filename,
      filePath: req.file.path,
      uploadDate: new Date(),
      documentType,
    });

    await newDocument.save();

    res.status(200).json({
      message: 'File uploaded successfully',
      filePath: req.file.path,
      documentType: documentType,
    });
  } catch (error) {
    console.error('Error during file upload:', error.message);
    res.status(500).json({ message: 'Internal server error during file upload' });
  }
});

// ----------------------------------------------
// Fetch User Profile Route
// ----------------------------------------------
router.get('/profile', userAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json({ user });
  } catch (error) {
    console.error('Error fetching user profile:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ----------------------------------------------
// Fetch Uploaded Files Route
// ----------------------------------------------
router.get('/uploaded-files', userAuth, async (req, res) => {
  try {
    const files = await UserDocument.find({ userId: req.userId });
    res.status(200).json({ files });
  } catch (error) {
    console.error('Error fetching uploaded files:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ----------------------------------------------
// Fetch All Users (Admin Use)
// ----------------------------------------------
router.get('/', async (req, res) => {
  try {
    const users = await User.find();
    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
