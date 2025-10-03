import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './services/logger.js';
import authRoutes from './routes/authRoutes.js';
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
if (!MONGODB_URI || !JWT_SECRET) {
  logger.error('❌ Missing required environment variables');
  process.exit(1);
}

// Express app
const app = express();

// Trust proxy for Render
app.set('trust proxy', 1);

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    logger.info(`🔍 CORS Check - Origin: ${origin || 'NO ORIGIN'}`);
    if (!origin) {
      logger.info('✅ CORS: Allowing request with no origin');
      return callback(null, true);
    }
    const staticOrigins = [
      'https://www.tendorai.com',
      'https://tendorai.com',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:3001',
      'https://localhost:3000',
      'https://ai-procurement-backend-q35u.onrender.com',
    ];
    const isVercelPreview = origin.includes('ai-procurement-frontend') && origin.includes('vercel.app');
    if (staticOrigins.includes(origin)) {
      logger.info(`✅ CORS: Allowing static origin - ${origin}`);
      callback(null, true);
    } else if (isVercelPreview) {
      logger.info(`✅ CORS: Allowing Vercel preview - ${origin}`);
      callback(null, true);
    } else {
      logger.warn(`❌ CORS BLOCKED: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cache-Control',
    'X-File-Name',
  ],
  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
  maxAge: 86400,
}));

// Handle preflight requests
app.options('*', cors({
  origin: function (origin, callback) {
    logger.info(`🔍 PREFLIGHT - Origin: ${origin || 'NO ORIGIN'}`);
    if (!origin) return callback(null, true);
    const staticOrigins = [
      'https://www.tendorai.com',
      'https://tendorai.com',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:3001',
      'https://localhost:3000',
      'https://ai-procurement-backend-q35u.onrender.com',
    ];
    const isVercelPreview = origin.includes('ai-procurement-frontend') && origin.includes('vercel.app');
    if (staticOrigins.includes(origin) || isVercelPreview) {
      logger.info(`✅ PREFLIGHT: Allowing ${origin}`);
      callback(null, true);
    } else {
      logger.warn(`❌ PREFLIGHT BLOCKED: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cache-Control',
    'X-File-Name',
  ],
}));

// CORS error handler
app.use((error, req, res, next) => {
  if (error.message === 'Not allowed by CORS') {
    logger.error(`❌ CORS Error - Origin: ${req.headers.origin || 'unknown'}, Method: ${req.method}, Path: ${req.path}`);
    return res.status(403).json({
      error: 'CORS Error',
      message: 'This origin is not allowed to access this resource',
      origin: req.headers.origin || 'unknown',
      method: req.method,
      path: req.path,
      timestamp: new Date().toISOString(),
      allowedPatterns: [
        'https://www.tendorai.com',
        'https://tendorai.com',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'https://ai-procurement-frontend-*.vercel.app',
        'https://ai-procurement-backend-q35u.onrender.com',
      ],
    });
  }
  next(error);
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

// Request logger
app.use((req, res, next) => {
  logger.info(`🔍 ${req.method} ${req.url} – Origin: ${req.headers.origin || 'none'}`);
  next();
});

// Ensure /uploads folder exists
const uploadsDir = path.join(__dirname, 'Uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  logger.info(`✅ Created uploads directory: ${uploadsDir}`);
}
app.use('/uploads', express.static(uploadsDir));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/vendors', vendorUploadRoutes);
app.use('/api/vendors/listings', vendorListingsRoutes);
app.use('/api/vendor-products', vendorProductRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/submit-request', submitRequestRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/copier-quotes', copierQuoteRoutes);

// AI Copier Suggestions Route
app.post('/api/suggest-copiers', async (req, res) => {
  try {
    logger.info('🤖 AI Copier suggestion request:', req.body);
    const suggestions = [];
    const { monthlyVolume, industryType, colour, min_speed, serviceType } = req.body;
    if (monthlyVolume?.total > 5000) {
      suggestions.push("High-volume multifunction device recommended for your print requirements");
    }
    if (monthlyVolume?.total < 1000) {
      suggestions.push("Compact desktop printer suitable for low-volume needs");
    }
    if (industryType === 'Legal' || industryType === 'Healthcare') {
      suggestions.push("Security-focused models with encryption and audit trails recommended");
    }
    if (industryType === 'Manufacturing' || industryType === 'Government') {
      suggestions.push("Industrial-grade devices with enhanced durability features");
    }
    if (colour === 'Color') {
      suggestions.push("Color multifunction printer with professional-grade output quality");
    }
    if (colour === 'Black & White') {
      suggestions.push("High-efficiency monochrome printer optimized for text documents");
    }
    if (min_speed && min_speed > 30) {
      suggestions.push("High-speed printing capability (30+ PPM) recommended for productivity");
    }
    if (serviceType === 'Production') {
      suggestions.push("Production-level equipment with finishing capabilities recommended");
    }
    if (suggestions.length === 0 && (monthlyVolume?.total || industryType)) {
      suggestions.push("Multifunction device with print, scan, and copy capabilities");
      suggestions.push("Energy-efficient model to reduce operational costs");
    }
    res.json({
      suggestions,
      message: suggestions.length > 0 ? "AI suggestions generated based on your requirements" : "Please provide more details for personalized recommendations",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('❌ Error in suggest-copiers:', error);
    res.status(500).json({
      error: 'Failed to generate suggestions',
      suggestions: [],
      message: 'AI suggestion service temporarily unavailable',
    });
  }
});

// Test endpoint
app.get('/api/test-dashboard', async (req, res) => {
  try {
    logger.info('🔍 Testing dashboard endpoints...');
    const testResults = {
      timestamp: new Date().toISOString(),
      server: 'TendorAI Backend',
      status: 'All systems operational',
      environment: process.env.NODE_ENV || 'development',
      mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
      corsConfig: {
        staticOrigins: [
          'https://www.tendorai.com',
          'https://tendorai.com',
          'http://localhost:3000',
          'http://127.0.0.1:3000',
          'https://ai-procurement-backend-q35u.onrender.com',
        ],
        vercelPreviewPattern: 'https://ai-procurement-frontend-*.vercel.app',
        vercelPreviewSupport: true,
        credentialsEnabled: true,
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
        { category: 'Vendors', path: '/api/vendors/signup', method: 'POST', status: 'Available', description: 'Vendor registration' },
        { category: 'Vendor Upload', path: '/api/vendors/upload', method: 'POST', status: 'Available', description: 'Upload vendor products' },
        { category: 'Vendor Upload', path: '/api/vendors/products', method: 'GET', status: 'Available', description: 'Get vendor products' },
        { category: 'Vendor Upload', path: '/api/vendors/upload-template', method: 'GET', status: 'Available', description: 'Download upload template' },
        { category: 'AI Features', path: '/api/suggest-copiers', method: 'POST', status: 'Available', description: 'Get AI-powered copier suggestions' },
      ],
      totalEndpoints: 21,
      message: '✅ All dashboard endpoints are now available including AI suggestions!',
      note: 'Your TendorAI platform is ready for production use with AI-powered recommendations.',
      dashboardFeatures: [
        '✅ User authentication and authorization',
        '✅ Quote request submission and management',
        '✅ Real-time dashboard with KPIs',
        '✅ Vendor matching and recommendations',
        '✅ File upload and document management',
        '✅ Notification system',
        '✅ Activity tracking',
        '✅ Multi-role support (Users, Vendors, Admins)',
        '✅ Dynamic CORS for Vercel deployments',
        '✅ Vendor product upload system',
        '✅ AI-powered copier suggestions',
      ],
    };
    res.json(testResults);
  } catch (error) {
    logger.error('❌ Test endpoint error:', error);
    res.status(500).json({
      error: error.message,
      message: 'Test endpoint encountered an error',
      timestamp: new Date().toISOString(),
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
      staticOrigins: [
        'https://www.tendorai.com',
        'https://tendorai.com',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'https://ai-procurement-backend-q35u.onrender.com',
      ],
      vercelPreviewPattern: 'https://ai-procurement-frontend-*.vercel.app',
      vercelPreviewSupport: true,
    },
    features: [
      'AI-powered vendor matching',
      'Quote request submission and management',
      'Multi-role authentication',
      'Real-time dashboard',
      'File upload support',
      'Notification system',
      'Dynamic CORS for Vercel deployments',
      'Vendor product upload system',
      'AI copier suggestions',
    ],
  });
});

// 404 fallback
app.use((req, res) => {
  logger.warn(`❌ Route not found: ${req.method} ${req.url}`);
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
      '/api/vendors/* - Vendor routes (including upload)',
      '/api/suggest-copiers - AI copier suggestions',
      '/ - Health check',
    ],
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('❌ Global Error:', err.message);
  logger.error('❌ Stack trace:', err.stack);
  const safeMessage = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message;
  res.status(500).json({
    message: '❌ Internal Server Error',
    error: safeMessage,
    timestamp: new Date().toISOString(),
    requestPath: req.url,
    method: req.method,
  });
});

// Start server
async function startServer() {
  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    logger.info(`✅ Connected to MongoDB: ${mongoose.connection.name}`);
    
    // Vendor migration script
    logger.info('🔗 Starting one-time vendor migration...');
    try {
      const { default: Vendor } = await import('./models/Vendor.js');
      const vendorsToMigrate = await Vendor.find({
        status: { $exists: true, $ne: null },
      });
      if (vendorsToMigrate.length > 0) {
        logger.info(`🔍 Found ${vendorsToMigrate.length} vendors to migrate. Updating...`);
        for (const vendor of vendorsToMigrate) {
          await Vendor.updateOne(
            { _id: vendor._id },
            {
              $set: { 'account.status': vendor.status },
              $unset: { status: '' },
            }
          );
        }
        logger.info('🎉 Migration complete!');
      } else {
        logger.info('⏭️ No vendors found with the old status field. Migration not needed.');
      }
    } catch (migrationError) {
      logger.error('❌ Migration script failed:', migrationError);
    }
    
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🌐 CORS enabled for:`);
      logger.info(` - https://www.tendorai.com`);
      logger.info(` - https://tendorai.com`);
      logger.info(` - http://localhost:3000`);
      logger.info(` - http://127.0.0.1:3000`);
      logger.info(` - https://ai-procurement-backend-q35u.onrender.com`);
      logger.info(` - https://ai-procurement-frontend-*.vercel.app (dynamic)`);
      logger.info(`📊 Test endpoint: /api/test-dashboard`);
      logger.info(`🏥 Health check: /`);
      logger.info(`📤 Vendor upload: /api/vendors/upload`);
      logger.info(`🤖 AI suggestions: /api/suggest-copiers`);
      logger.info(`🎉 TendorAI Backend is ready!`);
    });
    
    const shutdown = () => {
      logger.info('\n🛑 Shutting down gracefully...');
      server.close(() => {
        mongoose.connection.close(false, () => {
          logger.info('✅ MongoDB connection closed');
          logger.info('✅ Server shutdown complete');
          process.exit(0);
        });
      });
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('uncaughtException', (err) => {
      logger.error('❌ Uncaught Exception:', err);
      shutdown();
    });
    process.on('unhandledRejection', (reason) => {
      logger.error('❌ Unhandled Rejection:', reason);
      shutdown();
    });
  } catch (err) {
    logger.error('❌ Failed to connect to MongoDB:', err);
    process.exit(1);
  }
}

startServer();
