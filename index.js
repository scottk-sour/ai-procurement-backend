import 'dotenv/config'; // Automatically loads environment variables from .env
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import expressFormData from 'express-form-data';
import { fileURLToPath } from 'url';

// Import route files
import authRoutes from './routes/authRoutes.js';
import vendorRoutes from './routes/vendorRoutes.js';
import userRoutes from './routes/userRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import submitRequestRoutes from './routes/submitRequestRoutes.js';
import quoteRoutes from './routes/quoteRoutes.js';

const app = express();

// Handling __dirname and __filename in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Destructure environment variables
const {
  PORT = 5000, // Default to 5000 if not provided
  MONGODB_URI,
  JWT_SECRET,
} = process.env;

// Check environment variables
if (!MONGODB_URI || !JWT_SECRET) {
  console.error('❌ Missing required environment variables (MONGODB_URI, JWT_SECRET)');
  process.exit(1);
}

// Middleware setup
app.use(cors({ origin: 'http://localhost:3000', credentials: true })); // Adjust origin as needed
app.use(express.json()); // Parse JSON payloads
app.use(morgan('dev')); // Log HTTP requests in the console
app.use(expressFormData.parse()); // Parse form-data

// Ensure the 'uploads' directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir)); // Serve uploaded files

// Fix Mongoose deprecation warnings
mongoose.set('strictQuery', false);

// Connect to MongoDB
mongoose
  .connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ Connected to MongoDB:', mongoose.connection.name))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1); // Exit the process if the DB connection fails
  });

// Health-check route
app.get('/', (req, res) => {
  res.send('🚀 AI Procurement Backend is running!');
});

// Register API routes
app.use('/api/auth', authRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/submit-request', submitRequestRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global Error:', err.message);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

// Start the server once the DB is ready
mongoose.connection.once('open', () => {
  const server = app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
  });

  // Graceful shutdown function
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

  // Handle process termination signals
  process.on('SIGINT', shutdown); // Ctrl+C
  process.on('SIGTERM', shutdown); // Termination signal
  process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err.message);
    shutdown();
  });
  process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Rejection:', err.message);
    shutdown();
  });
});
