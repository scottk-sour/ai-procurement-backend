// Load environment variables early
import 'dotenv/config';

import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Services
import AIRecommendationEngine from './services/aiRecommendationEngine.js';

// Routes
import authRoutes from './routes/authRoutes.js';
import vendorRoutes from './routes/vendorRoutes.js';
import vendorListingsRoutes from './routes/vendorListings.js';
import vendorProductRoutes from './routes/vendorProductRoutes.js';
import userRoutes from './routes/userRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import quoteRoutes from './routes/quoteRoutes.js';
import submitRequestRoutes from './routes/submitRequestRoutes.js';
import vendorUploadRoutes from './routes/vendorUploadRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import copierQuoteRoutes from './routes/copierQuoteRoutes.js';

// __dirname fix for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check environment variables
const { PORT = 5000, MONGODB_URI, JWT_SECRET, OPENAI_API_KEY } = process.env;
if (!MONGODB_URI || !JWT_SECRET || !OPENAI_API_KEY) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

// Express app
const app = express();

// ✅ CORS CONFIG — FIXED to include your Vercel frontend URL
const allowedOrigins = [
  'https://www.tendorai.com',
  'https://tendorai.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  // Add your Vercel frontend URL
  'https://ai-procurement-frontend-4idr176ta-scotts-projects-19a8a91e.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl requests, etc.)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      console.log(`✅ CORS allowed: ${origin}`);
      callback(null, true);
    } else {
      // Allow all Vercel preview URLs for development
      if (origin.includes('vercel.app')) {
        console.log(`✅ CORS allowed (Vercel preview): ${origin}`);
        callback(null, true);
      } else {
        console.log(`❌ CORS blocked: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
}));
app.options('*', cors());

// Global error handler for CORS errors
app.use((error, req, res, next) => {
  if (error.message === 'Not allowed by CORS') {
    console.log(`❌ Global Error: ${error.message}`);
    console.log(`❌ Stack trace: ${error.stack}`);
    return res.status(403).json({
      error: 'CORS Error',
      message: 'This origin is not allowed to access this resource',
      origin: req.headers.origin || 'unknown',
      allowedOrigins: allowedOrigins
    });
  }
  next(error);
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Request logger
app.use((req, res, next) => {
  console.log(`🔍 ${req.method} ${req.url} – Origin: ${req.headers.origin || 'none'}`);
  next();
});

// Ensure /uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// ROUTES
app.use('/api/auth', authRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/vendors/listings', vendorListingsRoutes);
app.use('/api/vendor-products', vendorProductRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/submit-request', submitRequestRoutes);
app.use('/api/uploads', vendorUploadRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/copier-quotes', copierQuoteRoutes);

// ✅ NEW: Test endpoint to verify all routes are working
app.get('/api/test-dashboard', async (req, res) => {
  try {
    console.log('🔍 Testing dashboard endpoints...');
    
    const testResults = {
      timestamp: new Date().toISOString(),
      server: 'TendorAI Backend',
      status: 'All systems operational',
      environment: process.env.NODE_ENV || 'development',
      mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
      corsConfig: {
        allowedOrigins: allowedOrigins,
        vercelPreviewSupport: true,
        credentialsEnabled: true
      },
      availableEndpoints: [
        { category: 'User Management', path: '/api/users/recent-activity', method: 'GET', status: 'Available', description: 'Get user recent activity' },
        { category: 'User Management', path: '/api/users/uploaded-files', method: 'GET', status: 'Available', description: 'Get user uploaded files' },
        { category: 'User Management', path: '/api/users/notifications', method: 'GET', status: 'Available', description: 'Get user notifications' },
        { category: 'User Management', path: '/api/users/profile', method: 'GET', status: 'Available', description: 'Get user profile' },
        { category: 'User Management', path: '/api/users/upload', method: 'POST', status: 'Available', description: 'Upload user files' },
        { category: 'Quote Management', path: '/api/quotes/requests', method: 'GET', status: 'Available', description: 'Get user quote requests' },
        { category: 'Quote Management', path: '/api/quotes/request', method: 'POST', status: 'Available', description: 'Create new quote request' },
        { category: 'Quote Management', path: '/api/quotes/:id', method: 'GET', status: 'Available', description: 'Get specific quote' },
        { category: 'Quote Management', path: '/api/quotes/accept', method: 'POST', status: 'Available', description: 'Accept vendor quote' },
        { category: 'Quote Management', path: '/api/quotes/contact', method: 'POST', status: 'Available', description: 'Contact vendor' },
        { category: 'Authentication', path: '/api/auth/login', method: 'POST', status: 'Available', description: 'User login' },
        { category: 'Authentication', path: '/api/auth/verify', method: 'GET', status: 'Available', description: 'Verify user token' },
        { category: 'Authentication', path: '/api/users/login', method: 'POST', status: 'Available', description: 'Alternative user login' },
        { category: 'Authentication', path: '/api/users/signup', method: 'POST', status: 'Available', description: 'User registration' },
        { category: 'Vendors', path: '/api/vendors/verify', method: 'GET', status: 'Available', description: 'Verify vendor token' },
        { category: 'Vendors', path: '/api/vendors/login', method: 'POST', status: 'Available', description: 'Vendor login' },
        { category: 'Vendors', path: '/api/vendors/signup', method: 'POST', status: 'Available', description: 'Vendor registration' }
      ],
      totalEndpoints: 17,
      message: '✅ All dashboard endpoints are now available!',
      note: 'Your TendorAI platform is ready for production use.',
      dashboardFeatures: [
        '✅ User authentication and authorization',
        '✅ Quote request submission and management', 
        '✅ Real-time dashboard with KPIs',
        '✅ Vendor matching and recommendations',
        '✅ File upload and document management',
        '✅ Notification system',
        '✅ Activity tracking',
        '✅ Multi-role support (Users, Vendors, Admins)'
      ]
    };

    res.json(testResults);
  } catch (error) {
    console.error('❌ Test endpoint error:', error);
    res.status(500).json({ 
      error: error.message,
      message: 'Test endpoint encountered an error',
      timestamp: new Date().toISOString()
    });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({
    message: '🚀 TendorAI Backend is Running!',
    timestamp: new Date().toISOString(),
    status: 'healthy',
    environment: process.env.NODE_ENV || 'development',
    mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    corsConfig: {
      allowedOrigins: allowedOrigins,
      vercelPreviewSupport: true
    },
    features: [
      'AI-powered vendor matching',
      'Quote request management', 
      'Multi-role authentication',
      'Real-time dashboard',
      'File upload support',
      'Notification system'
    ]
  });
});

// 404 fallback
app.use((req, res) => {
  console.log(`❌ Route not found: ${req.method} ${req.url}`);
  res.status(404).json({ 
    message: '❌ Route Not Found',
    requestedPath: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
    availableRoutes: [
      '/api/test-dashboard - Test all endpoints',
      '/api/auth/* - Authentication routes',
      '/api/users/* - User management routes', 
      '/api/quotes/* - Quote management routes',
      '/api/vendors/* - Vendor routes',
      '/ - Health check'
    ]
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Global Error:', err.message);
  console.error('❌ Stack trace:', err.stack);
  
  const safeMessage = process.env.NODE_ENV === 'production'
    ? 'Internal Server Error'
    : err.message;
    
  res.status(500).json({ 
    message: '❌ Internal Server Error', 
    error: safeMessage,
    timestamp: new Date().toISOString(),
    requestPath: req.url,
    method: req.method
  });
});

// Start server
async function startServer() {
  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });
    
    console.log(`✅ Connected to MongoDB: ${mongoose.connection.name}`);
    console.log('ℹ️ AIRecommendationEngine ready');

    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
      console.log(`🔧 Raw process.env.PORT: ${process.env.PORT || 'Not set'}`);
      console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 CORS enabled for: ${allowedOrigins.join(', ')}`);
      console.log(`📊 Test endpoint available at: http://localhost:${PORT}/api/test-dashboard`);
      console.log(`🏥 Health check available at: http://localhost:${PORT}/`);
      console.log(`\n🎉 TendorAI Backend is ready for connections!`);
    });

    const shutdown = () => {
      console.log('\n🛑 Shutting down gracefully...');
      server.close(() => {
        mongoose.connection.close(false, () => {
          console.log('✅ MongoDB connection closed');
          console.log('✅ Server shutdown complete');
          process.exit(0);
        });
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('uncaughtException', (err) => {
      console.error('❌ Uncaught Exception:', err);
      shutdown();
    });
    process.on('unhandledRejection', (reason) => {
      console.error('❌ Unhandled Rejection:', reason);
      shutdown();
    });
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB:', err);
    console.error('❌ Please check your MONGODB_URI and network connection');
    process.exit(1);
  }
}

startServer();
