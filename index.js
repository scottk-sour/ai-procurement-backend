// Load environment variables early
import 'dotenv/config';

import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Services (AI Recommendation Engine)
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

// __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate required environment variables
const {
  PORT = 5000,
  MONGODB_URI,
  JWT_SECRET,
  OPENAI_API_KEY,
} = process.env;

if (!MONGODB_URI || !JWT_SECRET || !OPENAI_API_KEY) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

console.log(`🧩 Connecting to MongoDB URI: ${MONGODB_URI}`);

const app = express();

// ✅ UPDATED CORS config with better debugging and support
const allowedOrigins = [
  'http://localhost:3000', // React dev server
  'http://127.0.0.1:3000', // Alternative localhost
  'https://tendorai-frontend.onrender.com',
  'https://www.tendorai.com',
  'https://tendorai.com', // Add without www
  // Add your actual Render frontend URL if different from above
];

const corsOptions = {
  origin: function (origin, callback) {
    console.log(`🔍 CORS Check - Origin: ${origin}`); // Add this for debugging
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      console.log(`✅ CORS Allowed: No origin (likely same-origin or tool)`);
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      console.log(`✅ CORS Allowed: ${origin}`);
      callback(null, true);
    } else {
      console.warn(`❌ CORS Blocked: ${origin}`);
      console.warn(`❌ Allowed origins: ${allowedOrigins.join(', ')}`);
      callback(new Error(`Not allowed by CORS: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200 // For legacy browser support
};

// Enable CORS first
app.use(cors(corsOptions));

// ✅ Handle preflight requests explicitly with better logging
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  console.log(`🔍 Preflight OPTIONS request from: ${origin}`);
  console.log(`🔍 Preflight headers: ${JSON.stringify(req.headers)}`);
  
  if (!origin || allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    console.log(`✅ Preflight response sent for: ${origin}`);
    res.sendStatus(200);
  } else {
    console.warn(`❌ Preflight blocked for: ${origin}`);
    res.sendStatus(403);
  }
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Enhanced request logging
app.use((req, res, next) => {
  console.log(`🔍 ${req.method} ${req.url} - Origin: ${req.headers.origin || 'none'}`);
  console.log(`🔍 Headers: ${JSON.stringify({
    'content-type': req.headers['content-type'],
    'authorization': req.headers.authorization ? 'Present' : 'None',
    'user-agent': req.headers['user-agent']?.substring(0, 50) + '...'
  })}`);
  next();
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/vendors/listings', vendorListingsRoutes);
app.use('/api/vendor-products', vendorProductRoutes);
app.use('/api/users', userRoutes); // ✅ This should handle /api/users/login
app.use('/api/admin', adminRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/submit-request', submitRequestRoutes);
app.use('/api/uploads', vendorUploadRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/copier-quotes', copierQuoteRoutes);

// Health check with CORS headers
app.get('/', (req, res) => {
  // Ensure CORS headers are set for health check too
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  res.json({ 
    message: '🚀 TendorAI Backend is Running!',
    timestamp: new Date().toISOString(),
    cors: 'enabled',
    allowedOrigins: allowedOrigins
  });
});

// 404 fallback
app.use((req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.url}`);
  res.status(404).json({ message: '❌ Route Not Found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Global Error:', err.message);
  console.error('Stack:', err.stack);
  
  // Don't expose internal errors in production
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal Server Error' 
    : err.message;
    
  res.status(500).json({ 
    message: '❌ Internal Server Error', 
    error: message 
  });
});

// Connect to DB and start server
async function startServer() {
  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });

    console.log(`✅ Connected to MongoDB: ${mongoose.connection.name}`);
    console.log('ℹ️ AIRecommendationEngine ready (no preloading required)');

    const server = app.listen(Number(PORT), () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
      console.log(`🌐 CORS enabled for: ${allowedOrigins.join(', ')}`);
      console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    const shutdown = () => {
      console.log('\n🛑 Shutting down...');
      server.close(() => {
        mongoose.connection.close(false, () => {
          console.log('✅ MongoDB connection closed');
          process.exit(0);
        });
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('uncaughtException', (err) => {
      console.error('❌ Uncaught Exception:', err.message, err.stack);
      shutdown();
    });
    process.on('unhandledRejection', (reason) => {
      console.error('❌ Unhandled Rejection:', reason);
      shutdown();
    });
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB:', err.message, err.stack);
    process.exit(1);
  }
}

startServer();