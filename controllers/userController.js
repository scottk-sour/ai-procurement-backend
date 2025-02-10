// controllers/UserController.js

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import dotenv from 'dotenv';
import User from '../models/User.js';
import UserDocument from '../models/UserDocument.js';

dotenv.config();

const { JWT_SECRET } = process.env;
if (!JWT_SECRET) {
  console.error("❌ ERROR: Missing JWT_SECRET in environment variables.");
  process.exit(1);
}

/**
 * User Signup
 */
export const signup = async (req, res) => {
  const { name, email, password, company } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: '⚠ Name, email, and password are required' });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: '⚠ User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = new User({ name, email, password: hashedPassword, company });
    await newUser.save();

    res.status(201).json({ message: '✅ User registered successfully' });
  } catch (error) {
    console.error('❌ Error registering user:', error.message);
    res.status(500).json({ message: '❌ Internal server error' });
  }
};

/**
 * User Login
 */
export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: '⚠ Email and password are required' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: '❌ Invalid email or password' });
    }

    // Generate a JWT token with the userId in its payload
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '4h' });

    res.json({ token, userId: user._id, message: '✅ Login successful' });
  } catch (error) {
    console.error('❌ Error during user login:', error.message);
    res.status(500).json({ message: '❌ Internal server error' });
  }
};

/**
 * Get User Profile
 * (Assumes an authentication middleware has set req.userId)
 */
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: '⚠ User not found' });
    }
    res.status(200).json({ user });
  } catch (error) {
    console.error('❌ Error fetching user profile:', error.message);
    res.status(500).json({ message: '❌ Internal server error' });
  }
};

/**
 * Upload Document
 */
export const uploadFile = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: '⚠ No file uploaded or invalid file type' });
  }

  const documentType = req.body.documentType || 'others';

  try {
    // Assumes authentication middleware sets req.userId
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: '⚠ User not found' });

    const newDocument = new UserDocument({
      userId: req.userId,
      fileName: req.file.filename,
      filePath: req.file.path,
      uploadDate: new Date(),
      documentType,
    });

    await newDocument.save();

    res.status(200).json({
      message: '✅ File uploaded successfully',
      filePath: req.file.path,
      documentType,
    });
  } catch (error) {
    console.error('❌ Error during file upload:', error.message);
    res.status(500).json({ message: '❌ Internal server error during file upload' });
  }
};

/**
 * Fetch Uploaded Files
 */
export const getUploadedFiles = async (req, res) => {
  try {
    // Assumes req.userId is set by authentication middleware
    const files = await UserDocument.find({ userId: req.userId });
    res.status(200).json({ files });
  } catch (error) {
    console.error('❌ Error fetching uploaded files:', error.message);
    res.status(500).json({ message: '❌ Internal server error' });
  }
};

/**
 * Fetch Recent Activity
 */
export const getRecentActivity = async (req, res) => {
  try {
    // This is a hard-coded example; in a real application, you'd likely pull this from a database or activity log.
    const recentActivity = [
      { description: 'Uploaded a document', date: new Date().toISOString() },
      { description: 'Requested a quote', date: new Date().toISOString() },
    ];

    return res.status(200).json({ activities: recentActivity });
  } catch (error) {
    console.error('❌ Error fetching recent activity:', error.message);
    return res.status(500).json({
      message: '❌ Internal Server Error',
      details: error.message,
    });
  }
};
