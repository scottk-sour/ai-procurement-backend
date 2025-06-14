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

// Handle __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Validate Environment Variables
const {
  PORT = 5000,
  MONGODB_URI,
  JWT_SECRET,
  OPENAI_API_KEY
} = process.env;

if (!MONGODB_URI || !JWT_SECRET || !OPENAI_API_KEY) {
  console.error('❌ Missing required environment variables (MONGODB_URI, JWT_SECRET, OPENAI_API_KEY)');
  process.exit(1);
}

// ✅ Log which database URI is used
console.log(`🧩 Connecting to MongoDB URI: ${MONGODB_URI}`);

// Initialize Express App
const app = express();

// ✅ Improved CORS Setup for Local + Render Frontend
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://tendorai-frontend.onrender.com' // 🔁 Replace with your actual frontend URL if different
  ],
  credentials: true,
}));

// Middleware Setup
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.use((req, res, next) => {
  console.log(`🔍 ${req.method} ${req.url}`);
  next();
});

// Ensure 'uploads' directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Route Mounting
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

// Health Check
app.get('/', (req, res) => {
  res.send('🚀 TendorAI Backend is Running!');
});

// 404 Fallback
app.use((req, res) => {
  res.status(404).json({ message: '❌ Route Not Found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('❌ Global Error:', err.message, err.stack);
  res.status(500).json({ message: '❌ Internal Server Error', error: err.message });
});

// ✅ MongoDB Connection + Server Start
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
