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
import reviewRoutes from './routes/reviewRoutes.js';
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
// ALLOWED ORIGINS (single source of truth)
// ========================================
const ALLOWED_ORIGINS = [
  'https://www.tendorai.com',
  'https://tendorai.com',
  'https://app.tendorai.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'https://localhost:3000',
  'https://ai-procurement-backend-q35u.onrender.com',
];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow all Vercel preview deployments
  if (origin.endsWith('.vercel.app')) return true;
  return false;
}

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
      connectSrc: ["'self'", "https://www.tendorai.com", "https://tendorai.com", "https://app.tendorai.com", "https://ai-procurement-backend-q35u.onrender.com"],
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
    if (isAllowedOrigin(origin)) {
      logger.info(`✅ CORS: Allowing origin - ${origin || 'NO ORIGIN'}`);
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
    if (isAllowedOrigin(origin)) {
      logger.info(`✅ PREFLIGHT: Allowing ${origin || 'NO ORIGIN'}`);
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
        ...ALLOWED_ORIGINS,
        'https://*.vercel.app',
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
app.use('/api/reviews', reviewRoutes);
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
      staticOrigins: ALLOWED_ORIGINS,
      vercelPreviewPattern: 'https://*.vercel.app',
      vercelPreviewSupport: true,
    },
    features: [
      'AI-powered vendor matching',
      'Quote request submission and management',
      'Multi-role authentication',
      'Real-time dashboard',
      'File upload support',
      'Email notification system',
      'Dynamic CORS for Vercel deployments',
      'Vendor product upload system',
      'AI copier suggestions with real vendor quotes',
      'Public vendor directory API',
      'Helmet security headers',
      'Rate limiting protection',
      'NoSQL injection prevention',
      'XSS attack prevention',
      'Review and rating system',
      'Password reset flow',
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
      budget,
      colourRatio: inputColourRatio,
      // Enhanced matching parameters
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
      leasePreferred,
      numberOfUsers,
      numberOfCameras,
      systemType
    } = requirements;

    // Determine colour ratio (from direct param, requirements, or default)
    const colourRatio = inputColourRatio || requirements.colourRatio || 0.2;

    // Determine volume (prioritize specificVolume > requirements.monthlyVolume > volume param)
    let actualVolume = specificVolume || parseInt(volume) || 5000;
    if (!specificVolume && reqVolume) {
      const volumeMap = { low: 2000, medium: 6000, high: 15000, enterprise: 35000 };
      actualVolume = volumeMap[reqVolume] || 5000;
    }

    // Current monthly cost for savings calculation
    const currentMonthlyCost = currentSituation?.currentMonthlyCost || budget;

    // Service mapping
    const serviceType = category || service;
    const serviceMap = {
      'photocopiers': 'Photocopiers', 'copiers': 'Photocopiers', 'printers': 'Photocopiers',
      'mps': 'Photocopiers', 'managed print': 'Photocopiers',
      'telecoms': 'Telecoms', 'phones': 'Telecoms', 'voip': 'Telecoms',
      'cctv': 'CCTV', 'security cameras': 'CCTV',
      'it': 'IT', 'it support': 'IT', 'it-services': 'IT',
      'security': 'Security', 'software': 'Software'
    };
    const normalizedService = serviceType ? (serviceMap[serviceType.toLowerCase()] || serviceType) : null;

    // =====================================================
    // CATEGORY-SPECIFIC FOLLOW-UP QUESTIONS
    // =====================================================
    const photocopierQuestions = [
      { field: 'volume', question: 'How many pages do you print per month?', options: ['Under 1,000', '1,000-3,000', '3,000-5,000', '5,000-10,000', '10,000-20,000', '20,000-50,000', '50,000+'], impact: 'high', help: 'This determines the right machine size and cost efficiency.' },
      { field: 'colour', question: 'Do you need colour printing?', options: ['Yes - regularly', 'Yes - occasionally', 'No - mono only'], impact: 'high', help: 'Colour machines cost more per page but are essential for marketing materials.' },
      { field: 'a3', question: 'Do you need A3 paper size?', options: ['Yes', 'No', 'Not sure'], impact: 'high', help: 'A3 is needed for spreadsheets, posters, and architectural drawings.' },
      { field: 'colourRatio', question: 'What percentage of your prints are colour?', options: ['Under 10%', '10-25%', '25-50%', 'Over 50%'], impact: 'medium', help: 'This affects your cost-per-copy charges significantly.' },
      { field: 'features', question: 'Which features do you need?', options: ['Scanning', 'Duplex (double-sided)', 'Stapling', 'Booklet making', 'Hole punch', 'Wi-Fi', 'Cloud printing', 'Fax'], impact: 'medium', help: 'Finishing options like stapling add to the machine cost but save time.', multiSelect: true },
      { field: 'currentMonthlyCost', question: 'What do you currently pay per month?', options: ['Under £100', '£100-£200', '£200-£350', '£350-£500', 'Over £500', 'New setup'], impact: 'medium', help: 'Helps us calculate potential savings.' },
      { field: 'leaseOrBuy', question: 'Would you prefer to lease or buy?', options: ['Lease', 'Purchase outright', 'Either'], impact: 'low', help: 'Leasing spreads cost and includes service. Purchasing is cheaper long-term.' },
      { field: 'contractEnd', question: 'When does your current contract end?', options: ['Already ended', 'Within 3 months', '3-6 months', '6-12 months', 'Over 12 months', 'No current contract'], impact: 'low', help: 'Helps suppliers know your timeline.' },
      { field: 'numberOfDevices', question: 'How many devices do you need?', options: ['1', '2-3', '4-5', '6-10', '10+'], impact: 'medium', help: 'Multi-device deals often get better pricing.' },
      { field: 'currentProvider', question: 'Who is your current provider?', options: ['Canon', 'Konica Minolta', 'Xerox', 'Sharp', 'Ricoh', 'Brother', 'HP', 'Other', 'None'], impact: 'low', help: 'Helps understand what you are comparing against.' },
    ];

    const telecomsQuestions = [
      { field: 'numberOfUsers', question: 'How many users/extensions do you need?', options: ['1-5', '6-10', '11-25', '26-50', '51-100', '100+'], impact: 'high', help: 'Determines system size and licensing costs.' },
      { field: 'systemType', question: 'What type of phone system are you looking for?', options: ['Cloud/VoIP (hosted)', 'On-premise PBX', 'Microsoft Teams calling', 'Not sure'], impact: 'high', help: 'Cloud systems have lower upfront cost. On-premise gives more control.' },
      { field: 'features', question: 'Which features are important?', options: ['Auto attendant/IVR', 'Call recording', 'Mobile app', 'Video conferencing', 'CRM integration', 'Call queuing', 'Voicemail to email', 'Hot desking'], impact: 'medium', help: 'Feature requirements affect which providers can serve you.', multiSelect: true },
      { field: 'currentSystem', question: 'What system do you currently use?', options: ['Traditional landlines', 'Hosted VoIP', 'On-premise PBX', 'Microsoft Teams', 'Mobile phones only', 'None/new setup'], impact: 'medium', help: 'Helps understand migration complexity.' },
      { field: 'broadband', question: 'Do you need broadband included?', options: ['Yes - new connection needed', 'Yes - upgrade existing', 'No - already have suitable broadband'], impact: 'medium', help: 'VoIP systems need reliable broadband. Some providers include it.' },
      { field: 'currentMonthlyCost', question: 'What do you currently pay per month for telecoms?', options: ['Under £100', '£100-£300', '£300-£500', '£500-£1000', 'Over £1000', 'New setup'], impact: 'medium', help: 'Helps calculate savings.' },
      { field: 'contractEnd', question: 'When does your current contract end?', options: ['Already ended', 'Within 3 months', '3-6 months', '6-12 months', 'Over 12 months', 'No contract'], impact: 'low', help: 'Helps suppliers know your timeline.' },
      { field: 'handsets', question: 'Do you need desk phones or softphones?', options: ['Desk phones', 'Softphones (computer/mobile)', 'Mix of both', 'Not sure'], impact: 'low', help: 'Desk phones add hardware cost. Softphones work on existing devices.' },
    ];

    const cctvQuestions = [
      { field: 'numberOfCameras', question: 'How many cameras do you need?', options: ['1-4', '5-8', '9-16', '17-32', '32+'], impact: 'high', help: 'Determines system size and recording capacity.' },
      { field: 'cameraLocation', question: 'Where will cameras be installed?', options: ['Indoor only', 'Outdoor only', 'Both indoor and outdoor'], impact: 'high', help: 'Outdoor cameras need weatherproofing and night vision.' },
      { field: 'resolution', question: 'What resolution do you need?', options: ['HD (1080p)', '2K (1440p)', '4K (2160p)', 'Not sure'], impact: 'medium', help: '4K gives clearest images but needs more storage and bandwidth.' },
      { field: 'monitoring', question: 'How will the system be monitored?', options: ['Self-monitored (you watch footage)', 'Professional monitoring (24/7 service)', 'Both', 'Not sure'], impact: 'high', help: 'Professional monitoring adds monthly cost but provides security response.' },
      { field: 'storage', question: 'Where should footage be stored?', options: ['Cloud storage', 'Local NVR/DVR', 'Both cloud and local', 'Not sure'], impact: 'medium', help: 'Cloud is accessible anywhere. Local has no monthly fees.' },
      { field: 'features', question: 'Which features do you need?', options: ['Night vision', 'Motion detection', 'Remote mobile viewing', 'Number plate recognition (ANPR)', 'Facial recognition', 'Two-way audio', 'PTZ (pan/tilt/zoom)'], impact: 'medium', help: 'Advanced features like ANPR and facial recognition cost more.', multiSelect: true },
      { field: 'existingSystem', question: 'Do you have an existing CCTV system?', options: ['Yes - replacing/upgrading', 'Yes - adding cameras', 'No - new installation'], impact: 'low', help: 'Existing cabling may be reusable.' },
      { field: 'currentMonthlyCost', question: 'What do you currently pay per month?', options: ['Under £50', '£50-£100', '£100-£250', '£250-£500', 'Over £500', 'New setup'], impact: 'medium', help: 'Helps calculate potential savings.' },
    ];

    const itQuestions = [
      { field: 'numberOfUsers', question: 'How many users/devices do you need supported?', options: ['1-10', '11-25', '26-50', '51-100', '100-250', '250+'], impact: 'high', help: 'Per-user pricing is standard for managed IT.' },
      { field: 'serviceType', question: 'What type of IT support do you need?', options: ['Fully managed IT support', 'Co-managed (supplement your IT team)', 'One-off project', 'Consultancy/audit'], impact: 'high', help: 'Managed support is ongoing monthly. Projects are one-off.' },
      { field: 'requirements', question: 'Which services do you need?', options: ['Help desk support', 'Cloud migration', 'Microsoft 365 management', 'Cybersecurity', 'Backup & disaster recovery', 'Network infrastructure', 'Hardware procurement', 'VoIP/telecoms'], impact: 'high', help: 'Bundled services are often cheaper than buying separately.', multiSelect: true },
      { field: 'currentSetup', question: 'What is your current IT setup?', options: ['Mostly cloud-based', 'On-premise servers', 'Hybrid (cloud + on-premise)', 'Not sure'], impact: 'medium', help: 'Affects migration complexity and ongoing management.' },
      { field: 'productivity', question: 'Which productivity suite do you use?', options: ['Microsoft 365', 'Google Workspace', 'Both', 'Neither', 'Not sure'], impact: 'low', help: 'Providers often specialise in one platform.' },
      { field: 'cybersecurity', question: 'Do you have specific cybersecurity requirements?', options: ['Cyber Essentials certification needed', 'GDPR compliance support', 'Penetration testing', 'Security awareness training', 'No specific requirements'], impact: 'medium', help: 'Regulated industries often need specific security standards.' },
      { field: 'currentMonthlyCost', question: 'What do you currently pay per month for IT support?', options: ['Under £500', '£500-£1000', '£1000-£2500', '£2500-£5000', 'Over £5000', 'No current support'], impact: 'medium', help: 'Helps calculate potential savings.' },
      { field: 'contractEnd', question: 'When does your current IT contract end?', options: ['Already ended', 'Within 3 months', '3-6 months', '6-12 months', 'Over 12 months', 'No contract'], impact: 'low', help: 'Helps suppliers know your timeline.' },
    ];

    // Select questions based on category
    const categoryQuestionsMap = {
      'Photocopiers': photocopierQuestions,
      'Telecoms': telecomsQuestions,
      'CCTV': cctvQuestions,
      'IT': itQuestions,
    };
    const categoryQuestions = categoryQuestionsMap[normalizedService] || photocopierQuestions;

    // Filter out already-answered questions
    const getProvidedFields = () => {
      const provided = new Set();
      // Check direct params
      if (volume && volume !== 5000) provided.add('volume');
      if (colour !== undefined) provided.add('colour');
      if (a3 !== undefined) provided.add('a3');
      if (features && features.length > 0) provided.add('features');
      if (currentMonthlyCost) provided.add('currentMonthlyCost');
      if (numberOfUsers) provided.add('numberOfUsers');
      if (numberOfCameras) provided.add('numberOfCameras');
      if (systemType) provided.add('systemType');
      if (inputColourRatio) provided.add('colourRatio');
      // Check requirements object
      Object.keys(requirements).forEach(key => {
        if (requirements[key] !== undefined && requirements[key] !== null && requirements[key] !== '') {
          provided.add(key);
        }
      });
      // Check currentSituation
      Object.keys(currentSituation).forEach(key => {
        if (currentSituation[key] !== undefined && currentSituation[key] !== null) {
          provided.add(key);
        }
      });
      return provided;
    };
    const providedFields = getProvidedFields();
    const unansweredQuestions = categoryQuestions.filter(q => !providedFields.has(q.field));

    // Build vendor search query
    const searchQuery = {
      $or: [{ 'account.status': 'active' }, { status: 'active' }]
    };

    if (normalizedService) {
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
      } else if (queryLower.includes('it support') || queryLower.includes('managed it') || queryLower.includes('it services')) {
        searchQuery.services = { $in: ['IT'] };
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

    // Find vendors
    const vendors = await Vendor.find(searchQuery)
      .select('company services businessProfile.description businessProfile.yearsInBusiness location performance tier account brands postcodeAreas contactInfo')
      .sort({ 'performance.rating': -1 })
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

    // Helper: Calculate monthly cost with configurable colourRatio
    const calculateMonthlyCost = (product, monthlyVol, ratio) => {
      if (!product?.costs) return null;
      const monoPages = Math.round(monthlyVol * (1 - ratio));
      const colourPages = Math.round(monthlyVol * ratio);
      const monoCpc = (product.costs.cpcRates?.A4Mono || 0.8) / 100;
      const colourCpc = (product.costs.cpcRates?.A4Colour || 4.0) / 100;
      const cpcCost = (monoPages * monoCpc) + (colourPages * colourCpc);
      const quarterlyLease = product.leaseRates?.term60 || product.leaseRates?.term48 || product.leaseRates?.term36 || 300;
      const monthlyLease = quarterlyLease / 3;
      const monthlyService = (product.service?.quarterlyService || 75) / 3;
      return { total: Math.round(cpcCost + monthlyLease + monthlyService), cpc: Math.round(cpcCost), lease: Math.round(monthlyLease), service: Math.round(monthlyService) };
    };

    // Helper: Calculate savings
    const calculateSavings = (newMonthlyCost, currentCost) => {
      if (!newMonthlyCost || !currentCost) return null;
      const monthlySaving = currentCost - newMonthlyCost;
      if (monthlySaving <= 0) return null;
      return {
        monthly: Math.round(monthlySaving),
        annual: Math.round(monthlySaving * 12),
        percentage: Math.round((monthlySaving / currentCost) * 100),
        formatted: `£${Math.round(monthlySaving * 12).toLocaleString()}`
      };
    };

    // =====================================================
    // NEW SCORING ALGORITHM — Product Fit Priority
    // =====================================================
    const scoreMatch = (vendor, product, vol, reqColour, reqA3, reqFeatures, allPricing) => {
      let score = 0;
      const breakdown = { productFit: 0, vendorQuality: 0, tierBonus: 0, costEfficiency: 0 };

      // =====================================================
      // PRODUCT FIT (max 50 points) — MOST IMPORTANT
      // =====================================================
      if (product) {
        // Volume match (max 15)
        if (product.minVolume && product.maxVolume) {
          const midPoint = (product.minVolume + product.maxVolume) / 2;
          const range = product.maxVolume - product.minVolume;
          const volumeDiff = Math.abs(vol - midPoint);
          if (volumeDiff < range * 0.25) breakdown.productFit += 15;
          else if (volumeDiff < range * 0.5) breakdown.productFit += 10;
          else breakdown.productFit += 5;
        }

        // Feature match (max 15)
        if (reqFeatures && reqFeatures.length > 0 && product.features) {
          const matchedFeatures = reqFeatures.filter(f =>
            product.features.some(pf => pf.toLowerCase().includes(f.toLowerCase()))
          );
          const matchRatio = matchedFeatures.length / reqFeatures.length;
          if (matchRatio === 1) breakdown.productFit += 15;
          else if (matchRatio >= 0.75) breakdown.productFit += 10;
          else if (matchRatio >= 0.5) breakdown.productFit += 5;
        } else if (!reqFeatures || reqFeatures.length === 0) {
          // No features required - give partial credit for having features
          if (product.features?.length > 3) breakdown.productFit += 8;
          else if (product.features?.length > 0) breakdown.productFit += 5;
        }

        // Colour/A3 match (max 10)
        let colourA3Score = 0;
        if (reqColour !== undefined) {
          if (reqColour === true && product.isColour) colourA3Score += 5;
          else if (reqColour === false && !product.isColour) colourA3Score += 5;
          else if (reqColour === true && !product.isColour) colourA3Score -= 2; // Penalty for mismatch
        } else {
          colourA3Score += 2; // No requirement - partial credit
        }
        if (reqA3 !== undefined) {
          if (reqA3 === true && product.isA3) colourA3Score += 5;
          else if (reqA3 === false && !product.isA3) colourA3Score += 5;
          else if (reqA3 === true && !product.isA3) colourA3Score -= 2; // Penalty for mismatch
        } else {
          colourA3Score += 2; // No requirement - partial credit
        }
        breakdown.productFit += Math.max(0, Math.min(10, colourA3Score));

        // Speed appropriateness (max 5)
        const speed = product.speed || 0;
        if (vol > 10000 && speed >= 40) breakdown.productFit += 5;
        else if (vol > 10000 && speed >= 30) breakdown.productFit += 3;
        else if (vol > 3000 && speed >= 25) breakdown.productFit += 5;
        else if (vol > 3000 && speed >= 20) breakdown.productFit += 3;
        else if (vol <= 3000 && speed >= 20) breakdown.productFit += 5;
        else if (speed > 0) breakdown.productFit += 2;

        // Complete pricing data (max 5)
        if (product.costs?.cpcRates?.A4Mono && product.leaseRates) breakdown.productFit += 5;
        else if (product.costs?.cpcRates?.A4Mono) breakdown.productFit += 3;
      } else {
        // No product data - score based on vendor profile
        // Services match (already filtered, so give credit)
        breakdown.productFit += 20;
        // Has description
        if (vendor.businessProfile?.description) breakdown.productFit += 5;
        // Has website
        if (vendor.contactInfo?.website) breakdown.productFit += 3;
        // Has phone
        if (vendor.contactInfo?.phone) breakdown.productFit += 3;
      }

      // =====================================================
      // VENDOR QUALITY (max 30 points)
      // =====================================================
      // Customer rating (max 10)
      const rating = vendor.performance?.rating || 0;
      if (rating >= 4.5) breakdown.vendorQuality += 10;
      else if (rating >= 4.0) breakdown.vendorQuality += 7;
      else if (rating >= 3.5) breakdown.vendorQuality += 4;
      else if (rating > 0) breakdown.vendorQuality += 2;

      // Service quality (max 12) - only if product exists
      if (product?.service) {
        if (product.service.includesToner) breakdown.vendorQuality += 4;
        if (product.service.includesPartsLabour) breakdown.vendorQuality += 4;
        if (product.service.responseTime === '4hr') breakdown.vendorQuality += 4;
        else if (product.service.responseTime === '8hr') breakdown.vendorQuality += 2;
      }

      // Review count (max 4)
      const reviewCount = vendor.performance?.reviewCount || 0;
      if (reviewCount >= 10) breakdown.vendorQuality += 4;
      else if (reviewCount >= 5) breakdown.vendorQuality += 3;
      else if (reviewCount >= 1) breakdown.vendorQuality += 1;

      // Profile completeness (max 4)
      const hasDescription = vendor.businessProfile?.description?.length > 20;
      const hasWebsite = !!vendor.contactInfo?.website;
      const hasPhone = !!vendor.contactInfo?.phone;
      if (hasDescription && hasWebsite && hasPhone) breakdown.vendorQuality += 4;
      else if (hasDescription || hasWebsite) breakdown.vendorQuality += 2;

      // =====================================================
      // TIER BONUS (max 10 points) — small boost, NOT dominant
      // =====================================================
      const tier = vendor.tier || vendor.account?.tier || 'free';
      if (tier === 'verified') breakdown.tierBonus = 10;
      else if (tier === 'visible') breakdown.tierBonus = 5;
      else breakdown.tierBonus = 0;

      // =====================================================
      // COST EFFICIENCY (max 10 points) — calculated after all vendors processed
      // =====================================================
      // This is set later after we have all pricing data

      score = breakdown.productFit + breakdown.vendorQuality + breakdown.tierBonus;
      return { score, breakdown };
    };

    // Helper: Generate recommendation reason
    const generateReason = (vendor, product, savings, scoreBreakdown) => {
      const reasons = [];

      // Product-based reasons first
      if (product) {
        if (scoreBreakdown.productFit >= 40) reasons.push('Excellent product match for your requirements');
        else if (scoreBreakdown.productFit >= 30) reasons.push('Good product match for your needs');

        if (product.service?.includesToner && product.service?.includesPartsLabour) {
          reasons.push('All-inclusive service (toner, parts & labour)');
        }
        if (product.features?.length > 4) reasons.push('Feature-rich machine');
      }

      // Savings
      if (savings?.annual > 500) reasons.push(`Could save you ${savings.formatted}/year`);
      else if (savings?.annual > 100) reasons.push(`Potential savings of ${savings.formatted}/year`);

      // Vendor-based reasons
      const rating = vendor.performance?.rating;
      if (rating >= 4.5) reasons.push(`Highly rated (${rating}★)`);
      else if (rating >= 4.0) reasons.push(`Well rated (${rating}★)`);

      const tier = vendor.tier || vendor.account?.tier || 'free';
      if (tier === 'verified' && reasons.length < 3) reasons.push('Verified supplier');
      else if (tier === 'visible' && reasons.length < 3) reasons.push('Trusted local supplier');

      return reasons.length > 0 ? reasons.slice(0, 3).join('. ') + '.' : 'Serves your area with competitive pricing.';
    };

    // Build initial results with scoring
    const resultsWithScores = vendors.map(v => {
      const vid = v._id.toString();
      const products = productsByVendor[vid] || [];
      const bestProduct = products[0];
      const pricing = bestProduct ? calculateMonthlyCost(bestProduct, actualVolume, colourRatio) : null;
      const savings = pricing ? calculateSavings(pricing.total, currentMonthlyCost) : null;
      const { score, breakdown } = scoreMatch(v, bestProduct, actualVolume, colour, a3, features, null);

      return {
        vendor: v,
        bestProduct,
        pricing,
        savings,
        score,
        breakdown
      };
    });

    // Calculate cost efficiency scores (now that we have all pricing)
    const pricedResults = resultsWithScores.filter(r => r.pricing);
    if (pricedResults.length > 0) {
      const costs = pricedResults.map(r => r.pricing.total);
      const minCost = Math.min(...costs);
      const avgCost = costs.reduce((a, b) => a + b, 0) / costs.length;

      resultsWithScores.forEach(r => {
        if (r.pricing) {
          if (r.pricing.total === minCost) r.breakdown.costEfficiency = 10;
          else if (r.pricing.total < avgCost) r.breakdown.costEfficiency = 7;
          else if (r.pricing.total <= avgCost * 1.1) r.breakdown.costEfficiency = 4;
          else r.breakdown.costEfficiency = 2;
          r.score += r.breakdown.costEfficiency;
        }
      });
    }

    // Sort by score and limit
    const sortedResults = resultsWithScores
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(parseInt(limit), 10));

    // Build final results with badges for top 3
    const finalResults = sortedResults.map((r, index) => {
      const v = r.vendor;
      const bestProduct = r.bestProduct;

      return {
        id: v._id,
        company: v.company,
        services: v.services || [],
        description: v.businessProfile?.description || '',
        location: v.location?.city || '',
        coverage: v.location?.coverage || [],
        rating: v.performance?.rating || null,
        reviewCount: v.performance?.reviewCount || 0,
        brands: v.brands || [],
        tier: v.tier || v.account?.tier || 'free',
        matchScore: Math.min(Math.round(r.score), 99),
        scoreBreakdown: r.breakdown,
        rank: index + 1,
        badge: index === 0 ? 'Best Match' : index === 1 ? 'Runner Up' : index === 2 ? 'Great Option' : null,
        whyRecommended: generateReason(v, bestProduct, r.savings, r.breakdown),
        product: bestProduct ? {
          name: `${bestProduct.manufacturer} ${bestProduct.model}`,
          category: bestProduct.category,
          speed: bestProduct.speed,
          isColour: bestProduct.isColour,
          isA3: bestProduct.isA3,
          features: bestProduct.features?.slice(0, 5)
        } : null,
        pricing: r.pricing ? {
          estimatedMonthly: `£${r.pricing.total}`,
          breakdown: { lease: `£${r.pricing.lease}`, cpc: `£${r.pricing.cpc}`, service: `£${r.pricing.service}` },
          cpcMono: bestProduct?.costs?.cpcRates?.A4Mono ? `${bestProduct.costs.cpcRates.A4Mono}p` : null,
          cpcColour: bestProduct?.costs?.cpcRates?.A4Colour ? `${bestProduct.costs.cpcRates.A4Colour}p` : null,
          disclaimer: 'Estimate based on your volume. Request quote for final pricing.'
        } : null,
        savings: r.savings,
        service: bestProduct?.service ? {
          includesToner: bestProduct.service.includesToner,
          includesPartsLabour: bestProduct.service.includesPartsLabour,
          responseTime: bestProduct.service.responseTime
        } : null,
        profileUrl: `https://tendorai.com/suppliers/${v._id}`,
        quoteUrl: `https://tendorai.com/suppliers/${v._id}?quote=true`
      };
    });

    // Log AI query for analytics
    logger.info('AI Query endpoint called', {
      query, postcode, category, volume: actualVolume,
      colour, a3, colourRatio, resultsCount: finalResults.length,
      ip: req.ip, userAgent: req.get('User-Agent')
    });

    // Track AI mentions (non-blocking)
    try {
      const { default: VendorAnalytics } = await import('./models/VendorAnalytics.js');
      const userAgent = req.get('User-Agent') || '';
      const aiSource = detectAISource(userAgent, req.get('Referer'));

      const aiMentionEvents = finalResults.map((vendor, index) => ({
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
        metadata: { position: index + 1, totalResults: finalResults.length, matchScore: vendor.matchScore, badge: vendor.badge }
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
        const leadsToCreate = finalResults.slice(0, 3).map(vendor => ({
          vendor: vendor.id,
          service: normalizedService || 'Photocopiers',
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
    const pricedFinalResults = finalResults.filter(r => r.pricing);
    const maxSavings = finalResults.filter(r => r.savings).map(r => r.savings.annual);
    const summary = {
      totalMatches: finalResults.length,
      withPricing: pricedFinalResults.length,
      priceRange: pricedFinalResults.length > 0 ? {
        min: Math.min(...pricedFinalResults.map(r => parseInt(r.pricing.estimatedMonthly.replace('£', '')))),
        max: Math.max(...pricedFinalResults.map(r => parseInt(r.pricing.estimatedMonthly.replace('£', ''))))
      } : null,
      maxAnnualSavings: maxSavings.length > 0 ? Math.max(...maxSavings) : null
    };

    // Sort follow-up questions by impact (high first)
    const sortedQuestions = unansweredQuestions.sort((a, b) => {
      const impactOrder = { high: 0, medium: 1, low: 2 };
      return impactOrder[a.impact] - impactOrder[b.impact];
    });

    res.json({
      success: true,
      query: query || `${category || 'all services'} in ${searchLocation || 'UK'}`,
      count: finalResults.length,
      vendors: finalResults,
      summary,
      filters: { volume: actualVolume, colour, a3, features, colourRatio },
      followUp: sortedQuestions,
      answeredFields: Array.from(providedFields),
      note: pricedFinalResults.length > 0
        ? 'Prices are estimates based on your requirements. Request formal quotes for final pricing.'
        : 'Request quotes from these suppliers for personalised pricing.',
      compareUrl: `https://tendorai.com/compare?ids=${finalResults.map(r => r.id).join(',')}`,
      metadata: {
        monthlyVolume: actualVolume,
        colourRatio,
        source: 'TendorAI',
        website: 'https://tendorai.com',
        apiVersion: '3.0',
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
      ALLOWED_ORIGINS.forEach(origin => logger.info(` - ${origin}`));
      logger.info(` - https://*.vercel.app (all Vercel previews)`);
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
