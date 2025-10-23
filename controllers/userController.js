import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import User from '../models/User.js';
import UserDocument from '../models/UserDocument.js';
import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js';

// ----- User Signup -----
export const signup = catchAsync(async (req, res, next) => {
  const { name, email, password, company } = req.body;

  // Validation
  if (!name || !email || !password) {
    return next(new AppError('Name, email, and password are required.', 400));
  }

  if (password.length < 8) {
    return next(new AppError('Password must be at least 8 characters long.', 400));
  }

  // Check for existing user
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return next(new AppError('User already exists.', 400));
  }

  // Hash password
  console.log('🧪 Plain password before hashing:', password);
  const hashedPassword = await bcrypt.hash(password, config.security.bcryptRounds);
  console.log('🔐 Hashed password to save:', hashedPassword);

  // Create new user
  const newUser = new User({
    name,
    email: email.toLowerCase(),
    password: hashedPassword,
    company,
    role: 'user',
  });

  await newUser.save();
  console.log('✅ User saved:', newUser.email);
  console.log('📦 Full user object after save:', newUser);

  res.status(201).json({ message: 'User registered successfully.' });
});

// ----- User Login -----
export const login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // Validation
  if (!email || !password) {
    return next(new AppError('Email and password are required.', 400));
  }

  // Find user
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    console.log(`❌ No user found for email: ${email.toLowerCase()}`);
    return next(new AppError('Invalid email or password.', 401));
  }

  console.log('🔍 Found user:', user.email);
  console.log('🔐 Hashed in DB:', user.password);
  console.log('🔑 Plain password entered:', password);

  // Verify password
  const isMatch = await bcrypt.compare(password, user.password);
  console.log('✅ Password match:', isMatch);

  if (!isMatch) {
    console.log('❌ Password does not match');
    return next(new AppError('Invalid email or password.', 401));
  }

  // Generate JWT
  const token = jwt.sign(
    { userId: user._id, email: user.email, role: user.role || 'user' },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  res.status(200).json({
    message: 'Login successful',
    token,
    userId: user._id,
    name: user.name,
    email: user.email,
    role: user.role || 'user'
  });
});

// ----- Verify Token -----
export const verifyToken = catchAsync(async (req, res, next) => {
  const { user, decodedToken } = req;

  res.status(200).json({
    message: 'Token is valid',
    user: {
      userId: user._id,
      email: user.email,
      role: user.role || 'user',
      iat: decodedToken.iat,
      exp: decodedToken.exp,
    },
  });
});

// ----- Get User Profile -----
export const getUserProfile = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.userId).select('-password');

  if (!user) {
    return next(new AppError('User not found.', 404));
  }

  res.status(200).json({
    user: {
      userId: user._id,
      email: user.email,
      role: user.role || 'user',
      name: user.name,
      company: user.company
    }
  });
});

// ----- Upload File -----
export const uploadFile = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('No file uploaded or invalid file type.', 400));
  }

  const documentType = req.body.documentType || 'others';
  if (!['contract', 'invoice', 'others'].includes(documentType)) {
    return next(new AppError('Invalid document type.', 400));
  }

  const user = await User.findById(req.userId);
  if (!user) {
    return next(new AppError('User not found.', 404));
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
    message: 'File uploaded successfully.',
    filePath: req.file.path,
    documentType,
  });
});

// ----- Get Uploaded Files -----
export const getUploadedFiles = catchAsync(async (req, res, next) => {
  const files = await UserDocument.find({ userId: req.userId });
  res.status(200).json({ files });
});

// ----- Get Recent Activity -----
export const getRecentActivity = catchAsync(async (req, res, next) => {
  const recentActivity = [
    { description: 'Uploaded a document', date: new Date().toISOString() },
    { description: 'Requested a quote', date: new Date().toISOString() },
  ];
  res.status(200).json({ activities: recentActivity });
});

// ----- Get User Savings -----
export const getUserSavings = catchAsync(async (req, res, next) => {
  const { userId } = req.query;

  if (!userId) {
    return next(new AppError('User ID is required.', 400));
  }

  if (userId !== req.userId.toString()) {
    return next(new AppError('Unauthorized access to savings data.', 403));
  }

  const savings = {
    estimatedMonthlySavings: 42.5,
    estimatedAnnualSavings: 510.0,
  };

  res.status(200).json(savings);
});
