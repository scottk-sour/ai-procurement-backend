// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const expressFormData = require('express-form-data'); // Import express-form-data

// Import route files
const authRoutes = require('./routes/authRoutes');
const vendorRoutes = require('./routes/vendorRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const submitRequestRoutes = require('./routes/submitRequestRoutes'); // Ensure this route file exists

const app = express();

// Validate required environment variables
const { PORT, MONGODB_URI, JWT_SECRET, ADMIN_JWT_SECRET } = process.env;
if (!PORT || !MONGODB_URI || !JWT_SECRET || !ADMIN_JWT_SECRET) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

// Middleware setup
app.use(cors({ origin: 'http://localhost:3000', credentials: true })); // Adjust origin if necessary
app.use(express.json()); // Parse incoming JSON payloads
app.use(morgan('dev')); // Log HTTP requests

// Add express-form-data middleware
app.use(expressFormData.parse()); // Parse form-data requests

// Ensure the 'uploads' directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir)); // Serve uploaded files

// Fix for Mongoose deprecation warnings
mongoose.set('strictQuery', false);

// Connect to MongoDB
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// Root route for health check
app.get('/', (req, res) => {
  res.send('🚀 AI Procurement Backend is running!');
});

// Route integrations
app.use('/api/auth', authRoutes);            // Authentication routes
app.use('/api/vendors', vendorRoutes);       // Vendor-related routes
app.use('/api/users', userRoutes);           // User-related routes
app.use('/api/admin', adminRoutes);          // Admin-related routes
app.use('/api/analytics', analyticsRoutes);  // Analytics routes
app.use('/api', submitRequestRoutes);        // Quote submission routes

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global Error:', err.message);
  res.status(500).json({ message: 'Internal Server Error', error: err.message });
});

// Start the server only if the database is connected
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

  // Handle termination signals
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err.message);
    shutdown();
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Rejection:', err.message);
    shutdown();
  });
});
