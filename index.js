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

// Helper to detect AI assistant source from user agent or referrer
function detectAISource(userAgent, referer) {
  const ua = (userAgent || '').toLowerCase();
  const ref = (referer || '').toLowerCase();

  if (ua.includes('chatgpt') || ua.includes('openai') || ref.includes('openai') || ref.includes('chatgpt')) {
    return 'chatgpt';
  }
  if (ua.includes('claude') || ua.includes('anthropic') || ref.includes('anthropic') || ref.includes('claude')) {
    return 'claude';
  }
  if (ua.includes('perplexity') || ref.includes('perplexity')) {
    return 'perplexity';
  }
  if (ua.includes('bing') || ua.includes('copilot') || ref.includes('bing')) {
    return 'bing-copilot';
  }
  if (ua.includes('gemini') || ua.includes('google') || ref.includes('gemini')) {
    return 'gemini';
  }
  if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider')) {
    return 'bot';
  }
  return 'unknown-ai';
}

app.post('/api/ai-query', async (req, res) => {
  try {
    const {
      query,
      postcode,
      category,
      volume = 5000,
      service,
      location,
      limit = 10,
      // New parameters for enhanced matching
      requirements = {},
      currentSituation = {},
      contact = {}
    } = req.body;

    // Import models dynamically to avoid circular dependencies
    const { default: Vendor } = await import('./models/Vendor.js');
    const { default: VendorProduct } = await import('./models/VendorProduct.js');
    const { default: VendorLead } = await import('./models/VendorLead.js');

    // Extract requirements
    const {
      specificVolume,
      monthlyVolume: reqVolume,
      colour,
      a3,
      features,
      leasePreferred
    } = requirements;

    // Determine volume (prioritize specificVolume > requirements.monthlyVolume > volume param)
    let actualVolume = specificVolume || parseInt(volume) || 5000;
    if (!specificVolume && reqVolume) {
      const volumeMap = { low: 2000, medium: 6000, high: 15000, enterprise: 35000 };
      actualVolume = volumeMap[reqVolume] || 5000;
    }

    // Service mapping
    const serviceType = category || service;
    const serviceMap = {
      'photocopiers': 'Photocopiers', 'copiers': 'Photocopiers', 'printers': 'Photocopiers',
      'mps': 'Photocopiers', 'managed print': 'Photocopiers',
      'telecoms': 'Telecoms', 'phones': 'Telecoms', 'voip': 'Telecoms',
      'cctv': 'CCTV', 'security cameras': 'CCTV',
      'it': 'IT', 'it support': 'IT',
      'security': 'Security', 'software': 'Software'
    };

    // Build vendor search query
    const searchQuery = {
      $or: [{ 'account.status': 'active' }, { status: 'active' }]
    };

    if (serviceType) {
      const normalizedService = serviceMap[serviceType.toLowerCase()] || serviceType;
      searchQuery.services = { $in: [normalizedService] };
    }

    // Location filter
    const searchLocation = postcode || location;
    if (searchLocation) {
      const postcodePrefix = searchLocation.substring(0, 2).toUpperCase();
      searchQuery.$and = searchQuery.$and || [];
      searchQuery.$and.push({
        $or: [
          { 'location.coverage': { $regex: searchLocation, $options: 'i' } },
          { 'location.city': { $regex: searchLocation, $options: 'i' } },
          { 'location.region': { $regex: searchLocation, $options: 'i' } },
          { 'location.postcode': { $regex: searchLocation, $options: 'i' } },
          { postcodeAreas: { $regex: postcodePrefix, $options: 'i' } }
        ]
      });
    }

    // Parse natural language query
    if (query && !serviceType && !searchLocation) {
      const queryLower = query.toLowerCase();
      if (queryLower.includes('copier') || queryLower.includes('printer') || queryLower.includes('print')) {
        searchQuery.services = { $in: ['Photocopiers'] };
      } else if (queryLower.includes('phone') || queryLower.includes('telecom') || queryLower.includes('voip')) {
        searchQuery.services = { $in: ['Telecoms'] };
      } else if (queryLower.includes('cctv') || queryLower.includes('camera') || queryLower.includes('surveillance')) {
        searchQuery.services = { $in: ['CCTV'] };
      }

      const locationPatterns = ['cardiff', 'newport', 'swansea', 'bristol', 'bath', 'gloucester', 'exeter',
        'birmingham', 'manchester', 'london', 'leeds', 'sheffield', 'liverpool', 'wales', 'south west', 'midlands'];
      for (const loc of locationPatterns) {
        if (queryLower.includes(loc)) {
          searchQuery.$and = searchQuery.$and || [];
          searchQuery.$and.push({
            $or: [
              { 'location.city': { $regex: loc, $options: 'i' } },
              { 'location.region': { $regex: loc, $options: 'i' } }
            ]
          });
          break;
        }
      }
    }

    // Find vendors (prioritize by tier)
    const vendors = await Vendor.find(searchQuery)
      .select('company services businessProfile.description location performance tier account brands postcodeAreas')
      .sort({ tier: -1, 'performance.rating': -1 })
      .limit(Math.min(parseInt(limit) * 3, 30))
      .lean();

    // Build product query using new schema fields
    const vendorIds = vendors.map(v => v._id);
    const productQuery = {
      vendorId: { $in: vendorIds },
      status: 'active',
      minVolume: { $lte: actualVolume },
      maxVolume: { $gte: actualVolume }
    };

    // Apply colour filter
    if (colour === true) {
      productQuery.isColour = true;
    } else if (colour === false) {
      productQuery.$or = [{ isColour: false }, { 'costs.cpcRates.A4Colour': 0 }];
    }

    // Apply A3 filter
    if (a3 === true) {
      productQuery.isA3 = true;
    }

    // Apply features filter
    if (features && features.length > 0) {
      productQuery.features = { $all: features };
    }

    // Find matching products
    const vendorProducts = await VendorProduct.find(productQuery)
      .select('vendorId manufacturer model description category speed isColour isA3 features costs leaseRates service availability minVolume maxVolume')
      .sort({ 'costs.totalMachineCost': 1 })
      .lean();

    // Group products by vendor
    const productsByVendor = {};
    vendorProducts.forEach(p => {
      const vid = p.vendorId.toString();
      if (!productsByVendor[vid]) productsByVendor[vid] = [];
      productsByVendor[vid].push(p);
    });

    // Helper: Calculate monthly cost
    const calculateMonthlyCost = (product, monthlyVol, colourRatio = 0.2) => {
      if (!product?.costs) return null;
      const monoPages = Math.round(monthlyVol * (1 - colourRatio));
      const colourPages = Math.round(monthlyVol * colourRatio);
      const monoCpc = (product.costs.cpcRates?.A4Mono || 0.8) / 100;
      const colourCpc = (product.costs.cpcRates?.A4Colour || 4.0) / 100;
      const cpcCost = (monoPages * monoCpc) + (colourPages * colourCpc);
      const quarterlyLease = product.leaseRates?.term60 || product.leaseRates?.term48 || product.leaseRates?.term36 || 300;
      const monthlyLease = quarterlyLease / 3;
      const monthlyService = (product.service?.quarterlyService || 75) / 3;
      return { total: Math.round(cpcCost + monthlyLease + monthlyService), cpc: Math.round(cpcCost), lease: Math.round(monthlyLease), service: Math.round(monthlyService) };
    };

    // Helper: Calculate savings
    const calculateSavings = (newMonthlyCost, currentMonthlyCost) => {
      if (!newMonthlyCost || !currentMonthlyCost) return null;
      const monthlySaving = currentMonthlyCost - newMonthlyCost;
      if (monthlySaving <= 0) return null;
      return {
        monthly: Math.round(monthlySaving),
        annual: Math.round(monthlySaving * 12),
        percentage: Math.round((monthlySaving / currentMonthlyCost) * 100)
      };
    };

    // Helper: Score a match
    const scoreMatch = (vendor, product, vol) => {
      let score = 50;
      // Tier bonus (biggest factor for paid suppliers)
      if (vendor.tier === 'verified') score += 25;
      else if (vendor.tier === 'visible') score += 15;
      else if (vendor.tier === 'basic' || vendor.tier === 'managed') score += 20;
      // Has product data
      if (product) score += 10;
      if (product?.costs?.cpcRates?.A4Mono) score += 5;
      // Volume sweet spot
      if (product?.minVolume && product?.maxVolume) {
        const midPoint = (product.minVolume + product.maxVolume) / 2;
        const range = product.maxVolume - product.minVolume;
        const volumeDiff = Math.abs(vol - midPoint);
        if (volumeDiff < range * 0.25) score += 10;
        else if (volumeDiff < range * 0.5) score += 5;
      }
      // Service level
      if (product?.service?.includesToner) score += 3;
      if (product?.service?.includesPartsLabour) score += 3;
      // Rating
      if (vendor.performance?.rating >= 4.5) score += 5;
      else if (vendor.performance?.rating >= 4.0) score += 3;
      return Math.min(score, 99);
    };

    // Helper: Generate recommendation reason
    const generateReason = (vendor, product, savings) => {
      const reasons = [];
      if (vendor.tier === 'verified') reasons.push('Verified supplier with excellent track record');
      else if (vendor.tier === 'visible') reasons.push('Trusted local supplier');
      if (savings?.annual > 100) reasons.push(`Could save you £${savings.annual}/year`);
      if (product?.service?.includesToner && product?.service?.includesPartsLabour) {
        reasons.push('All-inclusive service (toner, parts & labour)');
      }
      if (product?.features?.length > 4) reasons.push('Feature-rich machine for your needs');
      if (vendor.performance?.rating >= 4.5) reasons.push(`Highly rated (${vendor.performance.rating}★)`);
      return reasons.length > 0 ? reasons.join('. ') + '.' : 'Serves your area with competitive pricing.';
    };

    // Build results with enhanced matching
    const currentMonthlyCost = currentSituation?.currentMonthlyCost;
    const results = vendors.map(v => {
      const vid = v._id.toString();
      const products = productsByVendor[vid] || [];
      const bestProduct = products[0];
      const pricing = bestProduct ? calculateMonthlyCost(bestProduct, actualVolume) : null;
      const savings = pricing ? calculateSavings(pricing.total, currentMonthlyCost) : null;
      const matchScore = scoreMatch(v, bestProduct, actualVolume);

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
        matchScore,
        whyRecommended: generateReason(v, bestProduct, savings),
        product: bestProduct ? {
          name: `${bestProduct.manufacturer} ${bestProduct.model}`,
          category: bestProduct.category,
          speed: bestProduct.speed,
          isColour: bestProduct.isColour,
          isA3: bestProduct.isA3,
          features: bestProduct.features?.slice(0, 5)
        } : null,
        pricing: pricing ? {
          estimatedMonthly: `£${pricing.total}`,
          breakdown: { lease: `£${pricing.lease}`, cpc: `£${pricing.cpc}`, service: `£${pricing.service}` },
          cpcMono: bestProduct?.costs?.cpcRates?.A4Mono ? `${bestProduct.costs.cpcRates.A4Mono}p` : null,
          cpcColour: bestProduct?.costs?.cpcRates?.A4Colour ? `${bestProduct.costs.cpcRates.A4Colour}p` : null,
          disclaimer: 'Estimate based on your volume. Request quote for final pricing.'
        } : null,
        savings,
        service: bestProduct?.service ? {
          includesToner: bestProduct.service.includesToner,
          includesPartsLabour: bestProduct.service.includesPartsLabour,
          responseTime: bestProduct.service.responseTime
        } : null,
        profileUrl: `https://tendorai.com/suppliers/${v._id}`,
        quoteUrl: `https://tendorai.com/suppliers/${v._id}?quote=true`
      };
    });

    // Sort by match score and limit
    const sortedResults = results
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, Math.min(parseInt(limit), 10));

    // Log AI query for analytics
    logger.info('AI Query endpoint called', {
      query, postcode, category, volume: actualVolume,
      colour, a3, resultsCount: sortedResults.length,
      ip: req.ip, userAgent: req.get('User-Agent')
    });

    // Track AI mentions (non-blocking)
    try {
      const { default: VendorAnalytics } = await import('./models/VendorAnalytics.js');
      const userAgent = req.get('User-Agent') || '';
      const aiSource = detectAISource(userAgent, req.get('Referer'));

      const aiMentionEvents = sortedResults.map((vendor, index) => ({
        vendorId: vendor.id,
        eventType: 'ai_mention',
        sessionId: `ai_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        source: {
          page: '/api/ai-query',
          referrer: aiSource,
          searchQuery: query || `${category || 'all'} in ${searchLocation || 'UK'}`,
          category: category || service || null,
          location: searchLocation || null
        },
        metadata: { position: index + 1, totalResults: sortedResults.length, matchScore: vendor.matchScore }
      }));

      if (aiMentionEvents.length > 0) {
        VendorAnalytics.insertMany(aiMentionEvents).catch(err => {
          logger.warn('Failed to track AI mentions', { error: err.message });
        });
      }
    } catch (trackingError) {
      logger.warn('AI mention tracking error', { error: trackingError.message });
    }

    // Create leads if contact details provided (non-blocking)
    if (contact?.email && contact?.companyName) {
      try {
        const leadsToCreate = sortedResults.slice(0, 3).map(vendor => ({
          vendor: vendor.id,
          service: serviceType ? (serviceMap[serviceType.toLowerCase()] || 'Other') : 'Photocopiers',
          customer: {
            companyName: contact.companyName,
            contactName: contact.contactName || '',
            email: contact.email,
            phone: contact.phone || '',
            postcode: searchLocation || ''
          },
          specificVolume: actualVolume,
          colour: colour,
          a3: a3,
          features: features,
          timeline: contact.timeline || 'planning',
          currentProvider: currentSituation?.currentProvider ? { name: currentSituation.currentProvider } : undefined,
          currentMonthlyCost: currentMonthlyCost,
          source: {
            page: '/api/ai-query',
            referrer: detectAISource(req.get('User-Agent'), req.get('Referer')),
            utm: { source: 'ai-assistant', medium: 'api', campaign: 'ai-query' }
          },
          status: 'pending'
        }));
        VendorLead.insertMany(leadsToCreate).catch(err => {
          logger.warn('Failed to create AI leads', { error: err.message });
        });
      } catch (leadError) {
        logger.warn('Lead creation error', { error: leadError.message });
      }
    }

    // Build summary
    const pricedResults = sortedResults.filter(r => r.pricing);
    const maxSavings = sortedResults.filter(r => r.savings).map(r => r.savings.annual);
    const summary = {
      totalMatches: sortedResults.length,
      withPricing: pricedResults.length,
      priceRange: pricedResults.length > 0 ? {
        min: Math.min(...pricedResults.map(r => parseInt(r.pricing.estimatedMonthly.replace('£', '')))),
        max: Math.max(...pricedResults.map(r => parseInt(r.pricing.estimatedMonthly.replace('£', ''))))
      } : null,
      maxAnnualSavings: maxSavings.length > 0 ? Math.max(...maxSavings) : null
    };

    res.json({
      success: true,
      query: query || `${category || 'all services'} in ${searchLocation || 'UK'}`,
      count: sortedResults.length,
      vendors: sortedResults,
      summary,
      filters: { volume: actualVolume, colour, a3, features },
      note: pricedResults.length > 0
        ? 'Prices are estimates based on your requirements. Request formal quotes for final pricing.'
        : 'Request quotes from these suppliers for personalised pricing.',
      compareUrl: `https://tendorai.com/compare?ids=${sortedResults.map(r => r.id).join(',')}`,
      metadata: {
        monthlyVolume: actualVolume,
        source: 'TendorAI',
        website: 'https://tendorai.com',
        apiVersion: '2.0',
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
