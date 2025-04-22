import 'dotenv/config'; // Load environment variables
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Handle __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate Required Environment Variables
const { PORT = 5000, MONGODB_URI, JWT_SECRET, OPENAI_API_KEY } = process.env;
if (!MONGODB_URI || !JWT_SECRET || !OPENAI_API_KEY) {
  console.error(
    '❌ ERROR: Missing required environment variables (MONGODB_URI, JWT_SECRET, or OPENAI_API_KEY)'
  );
  process.exit(1);
}

// Initialize Express App
const app = express();

// Middleware Setup
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '10mb' })); // Parse JSON payloads
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev')); // Log HTTP requests

// Debugging Middleware: Log Incoming Requests
app.use((req, res, next) => {
  console.log(`🔍 Incoming Request: ${req.method} ${req.url}`);
  if (req.method !== 'GET' && !req.is('application/json')) {
    console.warn('⚠ Warning: Request does not have Content-Type: application/json');
  }
  next();
});

// Ensure 'uploads' directory exists and serve it as static files
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Fix Mongoose Deprecation Warning
mongoose.set('strictQuery', false);

// Connect to MongoDB
mongoose
  .connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
  })
  .then(() => console.log(`✅ Connected to MongoDB: ${mongoose.connection.name}`))
  .catch((err) => {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1);
  });

// Health Check Route
app.get('/', (req, res) => {
  res.send('🚀 TendorAI Backend is Running!');
});

// Import and Register API Routes
import authRoutes from './routes/authRoutes.js';
import vendorRoutes from './routes/vendorRoutes.js';
import vendorListingsRoutes from './routes/vendorListings.js';
import vendorProductRoutes from './routes/vendorProductRoutes.js';
import userRoutes from './routes/userRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import quoteRoutes from './routes/quoteRoutes.js';
import submitRequestRoutes from './routes/submitRequestRoutes.js';
import vendorUploadsRoutes from './routes/vendorUploads.js';
import aiRoutes from './routes/aiRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import copierQuoteRoutes from './routes/copierQuoteRoutes.js'; // NEW ROUTE

// Mount the routes
app.use('/api/auth', authRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/vendors/listings', vendorListingsRoutes);
app.use('/api/vendor-products', vendorProductRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/submit-request', submitRequestRoutes);
app.use('/api/uploads', vendorUploadsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/copier-quotes', copierQuoteRoutes);

// 404 Handler for Unknown Routes
app.use((req, res) => {
  res.status(404).json({ message: '❌ Route Not Found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('❌ Global Error:', err.message);
  res.status(500).json({ message: '❌ Internal server error', error: err.message });
});

// Start Server After MongoDB is Connected
mongoose.connection.once('open', () => {
  const server = app.listen(Number(PORT), (err) => {
    if (err) {
      console.error('❌ Failed to start server:', err.message);
      if (err.code === 'EADDRINUSE') {
        console.log('⚠ Port 5000 is in use. Trying port 5001...');
        app.listen(5001, () => {
          console.log(`🚀 Server is running on http://localhost:5001`);
        });
      }
      return;
    }
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
  });

  // Graceful Shutdown Handling
  const shutdown = () => {
    console.log('\n🛑 Shutting down server...');
    server.close(() => {
      console.log('✅ Server closed');
      mongoose.connection.close(false, () => {
        console.log('✅ MongoDB connection closed');
        process.exit(0);
      });
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err.message);
    shutdown();
  });
  process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Rejection:', reason);
    shutdown();
  });
});
