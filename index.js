import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/env.js';
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
import publicVendorRoutes from './routes/publicVendorRoutes.js';
import vendorAnalyticsRoutes from './routes/vendorAnalyticsRoutes.js';
import sitemapRoutes from './routes/sitemap.js';
import visibilityRoutes from './routes/visibilityRoutes.js';
import vendorLeadRoutes from './routes/vendorLeadRoutes.js';
import stripeRoutes from './routes/stripeRoutes.js';
import notFoundHandler from './middleware/notFoundHandler.js';
import errorHandler from './middleware/errorHandler.js';
import requestId from './middleware/requestId.js';
import { suggestCopiers } from './controllers/aiController.js';

// __dirname fix for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Express app
const app = express();

// Trust proxy for Render
app.set('trust proxy', 1);

// ========================================
// 🔒 SECURITY MIDDLEWARE
// ========================================

// Helmet - Set security HTTP headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "https://www.tendorai.com", "https://tendorai.com", "https://ai-procurement-backend-q35u.onrender.com"],
    },
  },
  crossOriginEmbedderPolicy: false, // Needed for cross-origin resources
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// Rate limiting - General API (100 requests per 15 minutes)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    error: 'Too many requests',
    message: 'You have exceeded the 100 requests in 15 minutes limit. Please try again later.',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/';
  },
});

// Strict rate limiting for quote endpoints (10 requests per hour)
const quoteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    error: 'Quote request limit exceeded',
    message: 'You have exceeded the 10 quote requests per hour limit. Please try again later.',
    retryAfter: '1 hour',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limiter to all routes
app.use('/api/', generalLimiter);

// Data sanitization against NoSQL injection
app.use(mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    logger.warn(`🛡️ NoSQL Injection attempt blocked - Key: ${key}, IP: ${req.ip}`);
  },
}));

// Data sanitization against XSS
app.use(xss());

// Request ID middleware (for tracing)
app.use(requestId);

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
    'cache-control',
    'pragma',
    'Expires',
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
    'cache-control',
    'pragma',
    'Expires',
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
app.use(cookieParser());

// Stripe webhook needs raw body, so handle it before JSON parsing
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// JSON body parsing for all routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// HTTP request logging with Morgan + Winston
if (config.isDevelopment()) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', { stream: logger.stream }));
}

// Request/Response logging
app.use((req, res, next) => {
  logger.logRequest(req);
  res.on('finish', () => {
    logger.logResponse(req, res);
  });
  next();
});

// Ensure /uploads folder exists
const uploadsDir = path.join(__dirname, 'Uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  logger.info(`✅ Created uploads directory: ${uploadsDir}`);
}
app.use('/uploads', express.static(uploadsDir));

// Serve public directory for OpenAPI spec and other static assets
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}
app.use('/public', express.static(publicDir));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/vendors', vendorUploadRoutes);
app.use('/api/vendors/listings', vendorListingsRoutes);
app.use('/api/vendor-products', vendorProductRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/quotes', quoteLimiter, quoteRoutes);
app.use('/api/submit-request', submitRequestRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/copier-quotes', quoteLimiter, copierQuoteRoutes);
app.use('/api/public', publicVendorRoutes);
app.use('/api/vendor-leads', vendorLeadRoutes);
app.use('/api/analytics', vendorAnalyticsRoutes);
app.use('/api/visibility', visibilityRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/', sitemapRoutes);

// AI Copier Suggestions Route - Use enhanced AI controller with real vendor quotes
app.post('/api/suggest-copiers', quoteLimiter, suggestCopiers);

// OpenAPI specification for AI assistants (ChatGPT Actions, Claude MCP, etc.)
app.get('/openapi.json', (req, res) => {
  const openapiPath = path.join(__dirname, 'public', 'openapi.json');
  if (fs.existsSync(openapiPath)) {
    res.sendFile(openapiPath);
  } else {
    res.status(404).json({ error: 'OpenAPI specification not found' });
  }
});

app.get('/.well-known/openapi.json', (req, res) => {
  const openapiPath = path.join(__dirname, 'public', 'openapi.json');
  if (fs.existsSync(openapiPath)) {
    res.sendFile(openapiPath);
  } else {
    res.status(404).json({ error: 'OpenAPI specification not found' });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({
    message: '🚀 TendorAI Backend is Running!',
    timestamp: new Date().toISOString(),
    status: 'healthy',
    environment: config.app.env,
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
      'AI copier suggestions with real vendor quotes',
      'Public vendor directory API',
      'Helmet security headers',
      'Rate limiting protection',
      'NoSQL injection prevention',
      'XSS attack prevention',
    ],
  });
});

// =====================================================
// AI QUERY ENDPOINT (for llms.txt / AI assistant discovery)
// Simplified endpoint for AI assistants (ChatGPT, Claude, etc.)
// =====================================================
app.post('/api/ai-query', async (req, res) => {
  try {
    const { query, postcode, category, volume = 5000, service, location, limit = 10 } = req.body;

    // Import models dynamically to avoid circular dependencies
    const { default: Vendor } = await import('./models/Vendor.js');
    const { default: VendorProduct } = await import('./models/VendorProduct.js');

    // Build search query - check both old and new status field locations
    const searchQuery = {
      $or: [
        { 'account.status': 'active' },
        { status: 'active' }
      ]
    };

    // Service/category filter
    const serviceType = category || service;
    if (serviceType) {
      const serviceMap = {
        'photocopiers': 'Photocopiers',
        'copiers': 'Photocopiers',
        'printers': 'Photocopiers',
        'mps': 'Photocopiers',
        'managed print': 'Photocopiers',
        'telecoms': 'Telecoms',
        'phones': 'Telecoms',
        'voip': 'Telecoms',
        'cctv': 'CCTV',
        'security cameras': 'CCTV',
        'it': 'IT',
        'it support': 'IT',
        'security': 'Security',
        'software': 'Software'
      };
      const normalizedService = serviceMap[serviceType.toLowerCase()] || serviceType;
      searchQuery.services = { $in: [normalizedService] };
    }

    // Location filter (postcode or region)
    const searchLocation = postcode || location;
    if (searchLocation) {
      searchQuery.$and = searchQuery.$and || [];
      searchQuery.$and.push({
        $or: [
          { 'location.coverage': { $regex: searchLocation, $options: 'i' } },
          { 'location.city': { $regex: searchLocation, $options: 'i' } },
          { 'location.region': { $regex: searchLocation, $options: 'i' } },
          { 'location.postcode': { $regex: searchLocation, $options: 'i' } },
          { postcodeAreas: { $regex: searchLocation.substring(0, 2).toUpperCase(), $options: 'i' } }
        ]
      });
    }

    // Parse natural language query for keywords
    if (query && !serviceType && !searchLocation) {
      const queryLower = query.toLowerCase();

      // Extract service from query
      if (queryLower.includes('copier') || queryLower.includes('printer') || queryLower.includes('print')) {
        searchQuery.services = { $in: ['Photocopiers'] };
      } else if (queryLower.includes('phone') || queryLower.includes('telecom') || queryLower.includes('voip')) {
        searchQuery.services = { $in: ['Telecoms'] };
      } else if (queryLower.includes('cctv') || queryLower.includes('camera') || queryLower.includes('surveillance')) {
        searchQuery.services = { $in: ['CCTV'] };
      }

      // Extract location from query (common UK cities/regions)
      const locationPatterns = [
        'cardiff', 'newport', 'swansea', 'bristol', 'bath', 'gloucester', 'exeter',
        'birmingham', 'manchester', 'london', 'leeds', 'sheffield', 'liverpool',
        'wales', 'south west', 'midlands', 'north west', 'scotland'
      ];
      for (const loc of locationPatterns) {
        if (queryLower.includes(loc)) {
          searchQuery.$and = searchQuery.$and || [];
          searchQuery.$and.push({
            $or: [
              { 'location.coverage': { $regex: loc, $options: 'i' } },
              { 'location.city': { $regex: loc, $options: 'i' } },
              { 'location.region': { $regex: loc, $options: 'i' } }
            ]
          });
          break;
        }
      }
    }

    // Find vendors
    const vendors = await Vendor.find(searchQuery)
      .select('company services businessProfile.description location performance tier account brands postcodeAreas')
      .sort({ tier: -1, 'performance.rating': -1 })
      .limit(Math.min(parseInt(limit), 20))
      .lean();

    // Calculate pricing estimates
    const monthlyVolume = parseInt(volume) || 5000;
    const monoPages = Math.round(monthlyVolume * 0.7);
    const colourPages = monthlyVolume - monoPages;

    // Fetch pricing data
    const vendorIds = vendors.map(v => v._id);
    const vendorProducts = await VendorProduct.find({
      vendorId: { $in: vendorIds },
      minVolume: { $lte: monthlyVolume },
      maxVolume: { $gte: monthlyVolume * 0.5 }
    })
      .select('vendorId costs leaseRates')
      .sort({ 'costs.totalMachineCost': 1 })
      .lean();

    // Group products by vendor
    const productsByVendor = {};
    vendorProducts.forEach(p => {
      const vid = p.vendorId.toString();
      if (!productsByVendor[vid]) productsByVendor[vid] = [];
      productsByVendor[vid].push(p);
    });

    // Format response
    const results = vendors.map(v => {
      const vid = v._id.toString();
      const products = productsByVendor[vid] || [];
      const bestProduct = products[0];

      let pricing = null;
      if (bestProduct?.costs) {
        const monoCpc = (bestProduct.costs.cpcRates?.A4Mono || 0.8) / 100;
        const colourCpc = (bestProduct.costs.cpcRates?.A4Colour || 4.0) / 100;
        const quarterlyLease = bestProduct.leaseRates?.term60 || 300;
        const monthlyCpc = (monoPages * monoCpc) + (colourPages * colourCpc);
        const monthlyLease = quarterlyLease / 3;
        const monthlyService = 25;

        pricing = {
          estimatedMonthly: `£${Math.round(monthlyCpc + monthlyLease + monthlyService)}`,
          cpcMono: `${bestProduct.costs.cpcRates?.A4Mono || 0.8}p`,
          cpcColour: `${bestProduct.costs.cpcRates?.A4Colour || 4.0}p`,
          disclaimer: 'Estimate only - request quote for accurate pricing'
        };
      }

      return {
        id: v._id,
        company: v.company,
        services: v.services || [],
        description: v.businessProfile?.description || '',
        location: v.location?.city || '',
        coverage: v.location?.coverage || [],
        rating: v.performance?.rating || null,
        brands: v.brands || [],
        tier: v.tier || v.account?.tier || 'free',
        pricing,
        profileUrl: `https://www.tendorai.com/suppliers/${v._id}`,
        quoteUrl: `https://www.tendorai.com/quote?vendor=${v._id}`
      };
    });

    // Log AI query for analytics
    logger.info('AI Query endpoint called', {
      query,
      postcode,
      category,
      volume,
      resultsCount: results.length,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      query: query || `${category || 'all services'} in ${searchLocation || 'UK'}`,
      count: results.length,
      vendors: results,
      metadata: {
        monthlyVolume,
        source: 'TendorAI',
        website: 'https://www.tendorai.com',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('AI Query endpoint error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Failed to process AI query',
      message: error.message
    });
  }
});

// 404 Not Found handler
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(config.database.uri, config.database.options);
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
        logger.info('⭐️ No vendors found with the old status field. Migration not needed.');
      }
    } catch (migrationError) {
      logger.error('❌ Migration script failed:', migrationError);
    }
    
    const server = app.listen(config.app.port, () => {
      logger.info(`🚀 Server running on port ${config.app.port}`);
      logger.info(`🔧 Environment: ${config.app.env}`);
      logger.info(`🔒 Security headers enabled`);
      logger.info(`🌍 CORS enabled for:`);
      logger.info(` - https://www.tendorai.com`);
      logger.info(` - https://tendorai.com`);
      logger.info(` - http://localhost:3000`);
      logger.info(` - http://127.0.0.1:3000`);
      logger.info(` - https://ai-procurement-backend-q35u.onrender.com`);
      logger.info(` - https://ai-procurement-frontend-*.vercel.app (dynamic)`);
      logger.info(`🏥 Health check: /`);
      logger.info(`📤 Vendor upload: /api/vendors/upload`);
      logger.info(`🤖 AI suggestions: /api/suggest-copiers`);
      logger.info(`🌐 Public API: /api/public/vendors`);
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
