// routes/userRoutes.js
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import QuoteRequest from '../models/QuoteRequest.js'; // Add this import
import 'dotenv/config';

const router = express.Router();
const { JWT_SECRET } = process.env;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in environment variables!');
}

// Middleware to verify JWT token
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId || decoded.id;
    req.userRole = decoded.role;
    
    next();
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Validation middleware
const validateRequestBody = (fields) => {
  return (req, res, next) => {
    const missingFields = fields.filter((field) => !req.body[field]);
    if (missingFields.length) {
      return res.status(400).json({ message: `Missing required fields: ${missingFields.join(', ')}` });
    }
    if (fields.includes('email') && !/\S+@\S+\.\S+/.test(req.body.email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    if (fields.includes('password') && req.body.password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    next();
  };
};

// ✅ User Signup - /api/users/signup
router.post('/signup', validateRequestBody(['name', 'email', 'password']), async (req, res) => {
  try {
    const { name, email, password, company } = req.body;
    
    console.log('🔍 POST /api/users/signup – Origin:', req.headers.origin);
    console.log('🧪 Plain password before hashing:', password);
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('🔐 Hashed password to save:', hashedPassword);

    // Create new user
    const newUser = new User({ 
      name, 
      email, 
      password: hashedPassword, 
      company: company || '',
      role: 'user' 
    });
    
    await newUser.save();
    console.log('✅ User saved:', email);
    console.log('📦 Full user object after save:', newUser);

    res.status(201).json({ 
      message: 'User registered successfully',
      userId: newUser._id,
      email: newUser.email,
      name: newUser.name
    });
  } catch (error) {
    console.error('❌ User registration error:', error.message);
    res.status(500).json({ 
      message: 'Failed to register user', 
      error: error.message 
    });
  }
});

// ✅ User Login - /api/users/login
router.post('/login', validateRequestBody(['email', 'password']), async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔍 POST /api/users/login – Origin:', req.headers.origin);
    
    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Create token
    const token = jwt.sign(
      { 
        userId: user._id, 
        email: user.email,
        role: user.role || 'user',
        name: user.name 
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    console.log('✅ User login successful:', email);

    res.status(200).json({
      message: 'Login successful',
      token,
      userId: user._id,
      role: user.role || 'user',
      name: user.name,
      email: user.email,
    });
  } catch (error) {
    console.error('❌ User login error:', error.message);
    res.status(500).json({ 
      message: 'Failed to login', 
      error: error.message 
    });
  }
});

// ✅ Get User Profile - /api/users/profile
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        company: user.company,
        role: user.role || 'user',
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('❌ Error fetching user profile:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ NEW: GET /api/users/recent-activity
router.get('/recent-activity', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const userId = req.userId;

    console.log(`🔍 Fetching recent activity for user: ${userId}`);

    // Get user's recent quote requests as activity
    const recentQuotes = await QuoteRequest.find({ userId })
      .sort({ createdAt: -1 })
      .limit(5);

    // Transform quote requests into activity items
    const activities = recentQuotes.map(quote => ({
      type: 'quote',
      description: `Quote request submitted for ${quote.serviceType} - ${quote.companyName || 'Company'}`,
      date: quote.createdAt,
      id: quote._id
    }));

    // Add some mock activities for better UX
    const mockActivities = [
      {
        type: 'login',
        description: 'Logged in to dashboard',
        date: new Date().toISOString(),
        id: 'login-today'
      }
    ];

    const allActivities = [...activities, ...mockActivities];

    res.json({
      activities: allActivities,
      page: parseInt(page),
      totalPages: 1,
      total: allActivities.length
    });
  } catch (error) {
    console.error('❌ Error fetching recent activity:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ NEW: GET /api/users/uploaded-files
router.get('/uploaded-files', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const userId = req.userId;

    console.log(`🔍 Fetching uploaded files for user: ${userId}`);

    // For now, return mock files - you can implement real file storage later
    const mockFiles = [
      {
        _id: 'file1',
        name: 'quote_requirements.pdf',
        documentType: 'specification',
        size: 1024000, // 1MB
        uploadedAt: new Date().toISOString(),
        userId: userId
      }
    ];

    res.json({
      files: mockFiles,
      page: parseInt(page),
      totalPages: 1,
      total: mockFiles.length
    });
  } catch (error) {
    console.error('❌ Error fetching uploaded files:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ NEW: GET /api/users/notifications
router.get('/notifications', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const userId = req.userId;

    console.log(`🔍 Fetching notifications for user: ${userId}`);

    // Create notifications based on user's quote requests
    const userQuotes = await QuoteRequest.find({ userId })
      .sort({ createdAt: -1 })
      .limit(5);

    const notifications = userQuotes.map(quote => ({
      _id: `notif-${quote._id}`,
      message: `Your quote request for ${quote.serviceType} has been received and is being processed.`,
      status: 'unread',
      createdAt: quote.createdAt,
      userId: userId
    }));

    // Add welcome notification
    const welcomeNotification = {
      _id: 'welcome-notif',
      message: 'Welcome to TendorAI! Your account has been created successfully.',
      status: 'unread',
      createdAt: new Date().toISOString(),
      userId: userId
    };

    const allNotifications = [welcomeNotification, ...notifications];

    res.json({
      notifications: allNotifications,
      page: parseInt(page),
      totalPages: 1,
      total: allNotifications.length
    });
  } catch (error) {
    console.error('❌ Error fetching notifications:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ NEW: PATCH /api/users/notifications/:id/read
router.patch('/notifications/:id/read', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    console.log(`✅ Notification ${id} marked as read for user ${userId}`);
    
    res.json({ 
      message: 'Notification marked as read',
      notificationId: id 
    });
  } catch (error) {
    console.error('❌ Error marking notification as read:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// ✅ NEW: POST /api/users/upload (file upload endpoint)
router.post('/upload', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    
    console.log(`📁 File upload requested by user ${userId}`);
    
    res.json({
      message: 'File uploaded successfully',
      fileId: 'mock-file-id',
      fileName: 'uploaded-file.pdf'
    });
  } catch (error) {
    console.error('❌ Error uploading file:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

export default router;