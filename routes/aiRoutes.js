import express from 'express';
import { body, query, validationResult } from 'express-validator';
import helmet from 'helmet';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { suggestCopiers, healthCheck, aiRateLimit } from '../controllers/aiController.js';
import logger from '../services/logger.js';
import Vendor from '../models/Vendor.js';
import VendorLead from '../models/VendorLead.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Security middleware for AI routes - Fixed CSP for OpenAI
router.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "https://api.openai.com"], // Required for OpenAI API calls
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  crossOriginEmbedderPolicy: false // Required for API integrations
}));

// Enhanced CORS configuration for production
router.use(cors({
  origin: function (origin, callback) {
    // Define allowed origins - handle environment variables properly
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : ['http://localhost:3000', 'http://localhost:3001'];
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS origin not allowed', { 
        origin, 
        allowedOrigins,
        userAgent: origin ? 'browser' : 'no-origin'
      });
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Request-ID',
    'User-Agent',
    'Accept'
  ],
  credentials: true,
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
}));

// Request ID middleware for tracking
router.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || 
           `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Request logging middleware with better error handling
router.use((req, res, next) => {
  const start = Date.now();
  
  // Log request - but don't log sensitive data in production
  const logData = {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    requestId: req.id,
    timestamp: new Date().toISOString(),
    origin: req.get('Origin')
  };

  // Only log body in development
  if (process.env.NODE_ENV === 'development' && req.body) {
    logData.bodyKeys = Object.keys(req.body);
  }

  logger.info('AI API request', logData);

  // Enhanced response logging
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - start;
    
    const responseLogData = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      requestId: req.id,
      contentLength: data ? Buffer.byteLength(data, 'utf8') : 0
    };

    // Log at appropriate level based on status code
    if (res.statusCode >= 400) {
      logger.warn('AI API response - Error', responseLogData);
    } else {
      logger.info('AI API response', responseLogData);
    }
    
    originalSend.call(this, data);
  };
  
  next();
});

// Enhanced validation middleware for suggest-copiers endpoint
const validateSuggestCopiers = [
  // Basic formData validation
  body('formData')
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage('formData is required')
    .isObject()
    .withMessage('formData must be an object'),
  
  // Monthly volume validation with better handling
  body('formData.monthlyVolume')
    .optional()
    .isObject()
    .withMessage('monthlyVolume must be an object'),
    
  body('formData.monthlyVolume.total')
    .optional()
    .isNumeric()
    .toInt()
    .isInt({ min: 0, max: 1000000 })
    .withMessage('total monthly volume must be a number between 0 and 1,000,000'),
    
  body('formData.monthlyVolume.mono')
    .optional()
    .isNumeric()
    .toInt()
    .isInt({ min: 0, max: 1000000 })
    .withMessage('mono monthly volume must be a number between 0 and 1,000,000'),
    
  body('formData.monthlyVolume.colour')
    .optional()
    .isNumeric()
    .toInt()
    .isInt({ min: 0, max: 1000000 })
    .withMessage('colour monthly volume must be a number between 0 and 1,000,000'),
  
  // String validations with proper sanitization
  body('formData.industryType')
    .optional()
    .isString()
    .trim()
    .escape() // Prevent XSS
    .isLength({ min: 1, max: 100 })
    .withMessage('industryType must be a string between 1-100 characters'),
    
  body('formData.type')
    .optional()
    .isString()
    .trim()
    .isIn(['A4', 'A3', 'Letter', 'Legal', 'Tabloid'])
    .withMessage('paper type must be A4, A3, Letter, Legal, or Tabloid'),
    
  body('formData.min_speed')
    .optional()
    .isNumeric()
    .toInt()
    .isInt({ min: 1, max: 200 })
    .withMessage('minimum speed must be a number between 1-200 PPM'),
    
  body('formData.max_lease_price')
    .optional()
    .isNumeric()
    .toFloat()
    .isFloat({ min: 0, max: 100000 })
    .withMessage('max lease price must be a number between 0-100,000'),
    
  // Array validation with individual item checks
  body('formData.required_functions')
    .optional()
    .isArray({ max: 20 })
    .withMessage('required_functions must be an array with max 20 items'),
    
  body('formData.required_functions.*')
    .optional()
    .isString()
    .trim()
    .escape()
    .isLength({ min: 1, max: 50 })
    .withMessage('each required function must be 1-50 characters'),
    
  body('formData.colour')
    .optional()
    .isString()
    .trim()
    .isIn(['Yes', 'No', 'Optional', 'Mono only', 'Colour required'])
    .withMessage('colour preference must be valid option'),
    
  body('formData.location')
    .optional()
    .isString()
    .trim()
    .escape()
    .isLength({ min: 1, max: 100 })
    .withMessage('location must be 1-100 characters')
];

// Enhanced validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorDetails = errors.array().map(err => ({
      field: err.param,
      message: err.msg,
      value: err.value,
      location: err.location
    }));

    logger.warn('Validation errors in AI request', {
      errors: errorDetails,
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    return res.status(400).json({
      error: 'Validation failed',
      success: false,
      suggestions: [],
      details: errorDetails,
      requestId: req.id
    });
  }
  
  next();
};

// Enhanced content size limiter with better error handling
const contentSizeLimiter = (req, res, next) => {
  const contentLength = parseInt(req.get('Content-Length'), 10);
  const maxSize = 10 * 1024; // 10KB max request size
  
  if (contentLength && contentLength > maxSize) {
    logger.warn('Request too large', {
      contentLength,
      maxSize,
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    return res.status(413).json({
      error: 'Request too large',
      success: false,
      suggestions: [],
      maxSize: '10KB',
      received: `${Math.round(contentLength / 1024)}KB`,
      requestId: req.id
    });
  }
  
  next();
};

// Security middleware to check for suspicious patterns
const securityCheck = (req, res, next) => {
  const userAgent = req.get('User-Agent');
  const origin = req.get('Origin');
  
  // Basic bot detection
  if (userAgent && /bot|crawler|spider|scraper/i.test(userAgent)) {
    logger.warn('Bot request detected', {
      userAgent,
      ip: req.ip,
      requestId: req.id
    });
    
    return res.status(403).json({
      error: 'Automated requests not allowed',
      success: false,
      suggestions: []
    });
  }

  // Check for missing User-Agent (potential automated request)
  if (!userAgent && process.env.NODE_ENV === 'production') {
    logger.warn('Request without User-Agent', {
      ip: req.ip,
      origin,
      requestId: req.id
    });
    
    return res.status(400).json({
      error: 'User-Agent header required',
      success: false,
      suggestions: []
    });
  }

  next();
};

// Main suggest-copiers route with comprehensive middleware stack
router.post('/suggest-copiers', 
  aiRateLimit, // Rate limiting first
  securityCheck, // Security checks
  contentSizeLimiter, // Size check
  validateSuggestCopiers, // Validation
  handleValidationErrors, // Error handling
  suggestCopiers // Main controller
);

// Health check endpoint (no rate limiting for monitoring)
router.get('/health', healthCheck);

// Enhanced metrics endpoint for monitoring
router.get('/metrics', (req, res) => {
  try {
    const memoryUsage = process.memoryUsage();
    
    res.json({
      status: 'operational',
      version: '2.0.0',
      uptime: Math.floor(process.uptime()),
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`
      },
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      platform: process.platform
    });
  } catch (error) {
    logger.error('Error generating metrics', error);
    res.status(500).json({
      status: 'error',
      message: 'Unable to generate metrics'
    });
  }
});

// Enhanced API documentation endpoint
router.get('/docs', (req, res) => {
  res.json({
    title: 'TendorAI API',
    version: '3.0.0',
    description: 'AI-powered UK office equipment supplier discovery and quote request service',
    baseUrl: `${req.protocol}://${req.get('host')}/api/ai`,
    sections: {
      aiAssistant: {
        title: 'AI Assistant Integration',
        description: 'Endpoints designed for ChatGPT, Claude, and other AI assistants',
        endpoints: {
          'POST /suppliers': {
            description: 'Search for UK suppliers by service type and location',
            rateLimit: '10 requests per minute',
            authentication: 'None required',
            requestBody: {
              service: 'string (optional) - Service type: photocopiers, telecoms, cctv, it, security, software',
              location: 'string (optional) - UK region or city name',
              features: 'array (optional) - Required features/capabilities',
              limit: 'number (optional, 1-20) - Maximum results to return',
              referralSource: 'string (optional) - AI assistant identifier for tracking'
            },
            response: {
              success: 'boolean',
              count: 'number - Number of suppliers found',
              suppliers: 'array - List of matching suppliers with profile URLs'
            }
          },
          'GET /suppliers': {
            description: 'Simple GET version for supplier search',
            queryParams: {
              service: 'string (optional) - Service type',
              location: 'string (optional) - Location filter',
              limit: 'number (optional) - Max results'
            }
          },
          'GET /services': {
            description: 'List all available service categories',
            response: 'List of services with descriptions and keywords'
          },
          'GET /locations': {
            description: 'List UK regions and coverage areas',
            response: 'List of regions where suppliers operate'
          },
          'POST /quote': {
            description: 'Submit a quote request to a supplier',
            requestBody: {
              vendorId: 'string (required) - Supplier ID from search results',
              service: 'string (required) - Service type',
              companyName: 'string (required) - Customer company name',
              contactName: 'string (required) - Contact person name',
              email: 'string (required) - Contact email',
              phone: 'string (required) - Contact phone',
              postcode: 'string (optional) - UK postcode',
              message: 'string (optional) - Additional requirements',
              timeline: 'string (optional) - urgent, soon, planning, future',
              budgetRange: 'string (optional) - Budget indication',
              referralSource: 'string (optional) - AI assistant identifier'
            }
          },
          'GET /supplier/:id': {
            description: 'Get detailed information about a specific supplier',
            params: { id: 'Supplier ID or slug' }
          }
        }
      },
      copierSuggestion: {
        title: 'AI Copier Recommendation',
        description: 'Get AI-powered copier/printer recommendations',
        endpoints: {
          'POST /suggest-copiers': {
            description: 'Get AI-powered copier recommendations based on requirements',
            rateLimit: '10 requests per minute per IP',
            maxRequestSize: '10KB',
            authentication: 'None required',
            requestFormat: {
              formData: {
                monthlyVolume: {
                  total: 'number (0-1000000, optional)',
                  mono: 'number (optional)',
                  colour: 'number (optional)'
                },
                industryType: 'string (optional)',
                type: 'string (A4|A3, optional)',
                min_speed: 'number (1-200 PPM, optional)',
                max_lease_price: 'number (optional)',
                required_functions: 'array of strings (optional)',
                colour: 'string (Yes|No|Optional, optional)',
                location: 'string (optional)'
              }
            }
          }
        }
      },
      monitoring: {
        title: 'Health & Monitoring',
        endpoints: {
          'GET /health': {
            description: 'Check API health status'
          },
          'GET /metrics': {
            description: 'Get API performance metrics'
          }
        }
      }
    },
    errorCodes: {
      400: 'Bad Request - Invalid input data',
      403: 'Forbidden - Request blocked or supplier not accepting quotes',
      404: 'Not Found - Supplier or resource not found',
      408: 'Timeout - AI service timeout',
      413: 'Payload Too Large - Request exceeds size limit',
      429: 'Too Many Requests - Rate limit exceeded',
      500: 'Internal Server Error - Service unavailable'
    },
    support: {
      website: 'https://tendorai.com',
      documentation: 'https://tendorai.com/api-docs',
      contact: 'support@tendorai.com'
    }
  });
});

// OpenAPI specification endpoint for AI assistants (ChatGPT Actions, etc.)
router.get('/openapi.json', (req, res) => {
  try {
    const openapiPath = path.join(__dirname, '..', 'public', 'openapi.json');
    if (fs.existsSync(openapiPath)) {
      const openApiSpec = JSON.parse(fs.readFileSync(openapiPath, 'utf8'));
      res.json(openApiSpec);
    } else {
      res.status(404).json({ error: 'OpenAPI specification not found' });
    }
  } catch (error) {
    logger.error('Error serving OpenAPI spec', { error: error.message });
    res.status(500).json({ error: 'Failed to load OpenAPI specification' });
  }
});

// =====================================================
// AI ASSISTANT API ENDPOINTS (for ChatGPT, Claude, etc.)
// =====================================================

/**
 * POST /api/ai/suppliers
 * Find suppliers based on AI assistant query parameters
 */
router.post('/suppliers',
  aiRateLimit,
  [
    body('service').optional().isString().trim(),
    body('location').optional().isString().trim(),
    body('features').optional().isArray(),
    body('limit').optional().isInt({ min: 1, max: 20 }),
    body('referralSource').optional().isString().trim()
  ],
  async (req, res) => {
    try {
      const { service, location, features, limit = 10, referralSource } = req.body;

      // Build query for active vendors
      const query = { status: 'active' };

      // Filter by service if provided
      if (service) {
        const serviceMap = {
          'photocopiers': 'Photocopiers',
          'copiers': 'Photocopiers',
          'printers': 'Photocopiers',
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
        const normalizedService = serviceMap[service.toLowerCase()] || service;
        query.services = { $in: [normalizedService] };
      }

      // Filter by location/region if provided
      if (location) {
        query.$or = [
          { 'coverage.regions': { $regex: location, $options: 'i' } },
          { 'coverage.postcodes': { $regex: location, $options: 'i' } },
          { 'address.city': { $regex: location, $options: 'i' } },
          { 'address.county': { $regex: location, $options: 'i' } }
        ];
      }

      // Find vendors (prioritize paid tiers)
      const vendors = await Vendor.find(query)
        .select('company services description coverage address ratings account.tier showPricing slug')
        .sort({ 'account.tier': -1, 'ratings.average': -1 })
        .limit(Math.min(limit, 20))
        .lean();

      // Format response for AI consumption
      const suppliers = vendors.map(v => ({
        id: v._id,
        name: v.company,
        slug: v.slug,
        services: v.services || [],
        description: v.description || '',
        coverage: v.coverage?.regions || [],
        location: v.address?.city ? `${v.address.city}, ${v.address.county || ''}`.trim() : '',
        rating: v.ratings?.average || null,
        reviewCount: v.ratings?.count || 0,
        canReceiveQuotes: ['basic', 'managed', 'enterprise', 'standard'].includes(v.account?.tier) || v.showPricing === true,
        profileUrl: `https://tendorai.com/suppliers/${v.slug || v._id}`,
        quoteUrl: `https://tendorai.com/suppliers/${v.slug || v._id}?quote=true`
      }));

      // Log AI referral for analytics
      if (referralSource) {
        logger.info('AI supplier search', {
          referralSource,
          service,
          location,
          resultsCount: suppliers.length,
          requestId: req.id
        });
      }

      res.json({
        success: true,
        count: suppliers.length,
        suppliers,
        metadata: {
          service: service || 'all',
          location: location || 'nationwide',
          source: 'TendorAI API',
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('AI suppliers search error', { error: error.message, requestId: req.id });
      res.status(500).json({
        success: false,
        error: 'Failed to search suppliers',
        requestId: req.id
      });
    }
  }
);

/**
 * GET /api/ai/suppliers
 * Simple GET version for easier AI integration
 */
router.get('/suppliers',
  aiRateLimit,
  [
    query('service').optional().isString().trim(),
    query('location').optional().isString().trim(),
    query('limit').optional().isInt({ min: 1, max: 20 })
  ],
  async (req, res) => {
    try {
      const { service, location, limit = 10 } = req.query;

      const queryFilter = { status: 'active' };

      if (service) {
        const serviceMap = {
          'photocopiers': 'Photocopiers',
          'copiers': 'Photocopiers',
          'telecoms': 'Telecoms',
          'cctv': 'CCTV',
          'it': 'IT',
          'security': 'Security',
          'software': 'Software'
        };
        const normalizedService = serviceMap[service.toLowerCase()] || service;
        queryFilter.services = { $in: [normalizedService] };
      }

      if (location) {
        queryFilter.$or = [
          { 'coverage.regions': { $regex: location, $options: 'i' } },
          { 'address.city': { $regex: location, $options: 'i' } }
        ];
      }

      const vendors = await Vendor.find(queryFilter)
        .select('company services description coverage address ratings slug')
        .sort({ 'ratings.average': -1 })
        .limit(Math.min(parseInt(limit), 20))
        .lean();

      const suppliers = vendors.map(v => ({
        id: v._id,
        name: v.company,
        services: v.services || [],
        location: v.address?.city || '',
        rating: v.ratings?.average || null,
        profileUrl: `https://tendorai.com/suppliers/${v.slug || v._id}`
      }));

      res.json({
        success: true,
        count: suppliers.length,
        suppliers
      });

    } catch (error) {
      logger.error('AI suppliers GET error', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to fetch suppliers' });
    }
  }
);

/**
 * GET /api/ai/services
 * List all available service categories
 */
router.get('/services', (req, res) => {
  res.json({
    success: true,
    services: [
      {
        id: 'photocopiers',
        name: 'Photocopiers & Printers',
        description: 'Office multifunction printers, copiers, managed print services',
        keywords: ['copier', 'printer', 'MFP', 'print', 'copy', 'scan', 'fax']
      },
      {
        id: 'telecoms',
        name: 'Telecoms & Phone Systems',
        description: 'Business phone systems, VoIP, unified communications',
        keywords: ['phone', 'voip', 'pbx', 'telephone', 'communications', 'calls']
      },
      {
        id: 'cctv',
        name: 'CCTV & Surveillance',
        description: 'Security cameras, video surveillance, monitoring systems',
        keywords: ['camera', 'surveillance', 'security', 'monitoring', 'video']
      },
      {
        id: 'it',
        name: 'IT Support & Services',
        description: 'Managed IT services, support, infrastructure',
        keywords: ['it', 'support', 'network', 'computer', 'server', 'cloud']
      },
      {
        id: 'security',
        name: 'Security Systems',
        description: 'Access control, alarms, physical security',
        keywords: ['alarm', 'access', 'intruder', 'security', 'door']
      },
      {
        id: 'software',
        name: 'Business Software',
        description: 'Enterprise software, document management, workflow',
        keywords: ['software', 'application', 'document', 'workflow', 'erp']
      }
    ],
    metadata: {
      source: 'TendorAI',
      region: 'UK',
      timestamp: new Date().toISOString()
    }
  });
});

/**
 * GET /api/ai/locations
 * List coverage areas/regions
 */
router.get('/locations', async (req, res) => {
  try {
    // Get unique regions from vendor coverage
    const regions = await Vendor.distinct('coverage.regions', { status: 'active' });

    // Standard UK regions
    const ukRegions = [
      'London', 'South East', 'South West', 'East of England',
      'West Midlands', 'East Midlands', 'Yorkshire', 'North West',
      'North East', 'Wales', 'Scotland', 'Northern Ireland'
    ];

    // Combine and dedupe
    const allRegions = [...new Set([...ukRegions, ...regions.filter(r => r)])];

    res.json({
      success: true,
      locations: allRegions.map(region => ({
        name: region,
        type: 'region'
      })),
      note: 'Suppliers may cover additional areas. Use postcode for precise matching.',
      metadata: {
        source: 'TendorAI',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('AI locations error', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch locations' });
  }
});

/**
 * POST /api/ai/quote
 * Submit a quote request via AI assistant
 */
router.post('/quote',
  aiRateLimit,
  [
    body('vendorId').notEmpty().withMessage('vendorId is required'),
    body('service').notEmpty().withMessage('service is required'),
    body('companyName').notEmpty().trim().withMessage('companyName is required'),
    body('contactName').notEmpty().trim().withMessage('contactName is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('phone').notEmpty().trim().withMessage('phone is required'),
    body('message').optional().trim(),
    body('referralSource').optional().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array().map(e => e.msg)
        });
      }

      const {
        vendorId,
        service,
        companyName,
        contactName,
        email,
        phone,
        postcode,
        message,
        timeline,
        budgetRange,
        referralSource
      } = req.body;

      // Verify vendor exists and can receive quotes
      const vendor = await Vendor.findById(vendorId);
      if (!vendor) {
        return res.status(404).json({
          success: false,
          error: 'Supplier not found'
        });
      }

      const tier = vendor.account?.tier || vendor.tier || 'free';
      const canReceiveQuotes = ['basic', 'managed', 'enterprise', 'standard'].includes(tier) || vendor.showPricing === true;

      if (!canReceiveQuotes) {
        return res.status(403).json({
          success: false,
          error: 'This supplier is not currently accepting quote requests via API'
        });
      }

      // Map service name to enum value
      const serviceMap = {
        'photocopiers': 'Photocopiers',
        'copiers': 'Photocopiers',
        'printers': 'Photocopiers',
        'telecoms': 'Telecoms',
        'cctv': 'CCTV',
        'it': 'IT',
        'security': 'Security',
        'software': 'Software'
      };
      const normalizedService = serviceMap[service.toLowerCase()] || service;

      // Create the lead
      const lead = new VendorLead({
        vendor: vendorId,
        service: normalizedService,
        timeline: timeline || 'planning',
        budgetRange: budgetRange || 'discuss',
        customer: {
          companyName,
          contactName,
          email,
          phone,
          postcode: postcode || '',
          message: message || ''
        },
        source: {
          page: 'ai-assistant',
          referrer: referralSource || 'chatgpt',
          utm: {
            source: 'ai-assistant',
            medium: 'api',
            campaign: referralSource || 'chatgpt'
          }
        },
        status: 'pending'
      });

      await lead.save();

      // Log for analytics
      logger.info('AI quote request submitted', {
        leadId: lead._id,
        vendorId,
        service: normalizedService,
        referralSource,
        requestId: req.id
      });

      res.json({
        success: true,
        data: {
          quoteId: lead._id,
          message: 'Quote request submitted successfully. The supplier will contact you shortly.',
          supplierName: vendor.company,
          expectedResponse: '1-2 business days'
        }
      });

    } catch (error) {
      logger.error('AI quote submission error', { error: error.message, requestId: req.id });

      if (error.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: Object.values(error.errors).map(e => e.message)
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to submit quote request'
      });
    }
  }
);

/**
 * GET /api/ai/supplier/:id
 * Get detailed supplier information for AI
 */
router.get('/supplier/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const vendor = await Vendor.findOne({
      $or: [
        { _id: id },
        { slug: id }
      ],
      status: 'active'
    }).select('-password -refreshToken').lean();

    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Supplier not found'
      });
    }

    res.json({
      success: true,
      supplier: {
        id: vendor._id,
        name: vendor.company,
        slug: vendor.slug,
        description: vendor.description || '',
        services: vendor.services || [],
        coverage: {
          regions: vendor.coverage?.regions || [],
          postcodes: vendor.coverage?.postcodes || [],
          nationwide: vendor.coverage?.nationwide || false
        },
        location: {
          city: vendor.address?.city || '',
          county: vendor.address?.county || '',
          postcode: vendor.address?.postcode || ''
        },
        contact: {
          phone: vendor.phone || '',
          email: vendor.email || '',
          website: vendor.website || ''
        },
        rating: vendor.ratings?.average || null,
        reviewCount: vendor.ratings?.count || 0,
        canReceiveQuotes: ['basic', 'managed', 'enterprise', 'standard'].includes(vendor.account?.tier) || vendor.showPricing === true,
        profileUrl: `https://tendorai.com/suppliers/${vendor.slug || vendor._id}`,
        quoteUrl: `https://tendorai.com/suppliers/${vendor.slug || vendor._id}?quote=true`
      }
    });

  } catch (error) {
    logger.error('AI supplier detail error', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to fetch supplier' });
  }
});

// Enhanced error handling middleware specific to AI routes
router.use((error, req, res, next) => {
  // Generate error ID for tracking
  const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  logger.error('AI route error', {
    errorId,
    error: {
      message: error.message,
      name: error.name,
      code: error.code,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    },
    request: {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      origin: req.get('Origin')
    },
    requestId: req.id,
    timestamp: new Date().toISOString()
  });

  // Handle specific error types
  let statusCode = 500;
  let message = 'Internal server error';
  
  if (error.message === 'Not allowed by CORS') {
    statusCode = 403;
    message = 'Request not allowed from this origin';
  } else if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Invalid request data';
  } else if (error.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = 'Request too large';
  }

  // Don't expose internal error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(statusCode).json({
    error: message,
    success: false,
    suggestions: [],
    errorId,
    requestId: req.id,
    timestamp: new Date().toISOString(),
    ...(isDevelopment && { 
      details: error.message,
      stack: error.stack 
    })
  });
});

// Enhanced 404 handler for AI routes
router.use('*', (req, res) => {
  logger.warn('AI route not found', {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    requestId: req.id
  });

  res.status(404).json({
    error: 'API endpoint not found',
    success: false,
    message: `The endpoint ${req.method} ${req.originalUrl} does not exist`,
    availableEndpoints: [
      'POST /api/ai/suggest-copiers',
      'POST /api/ai/suppliers',
      'GET /api/ai/suppliers',
      'GET /api/ai/services',
      'GET /api/ai/locations',
      'POST /api/ai/quote',
      'GET /api/ai/supplier/:id',
      'GET /api/ai/health',
      'GET /api/ai/metrics',
      'GET /api/ai/docs'
    ],
    documentation: '/api/ai/docs',
    requestId: req.id,
    timestamp: new Date().toISOString()
  });
});

export default router;
