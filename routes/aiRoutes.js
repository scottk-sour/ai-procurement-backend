import express from 'express';
import { body, validationResult } from 'express-validator';
import helmet from 'helmet';
import cors from 'cors';
import { suggestCopiers, healthCheck, aiRateLimit } from '../controllers/aiController.js';
import logger from '../services/logger.js';

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
    title: 'TendorAI Copier Suggestion API',
    version: '2.0.0',
    description: 'AI-powered copier and printer recommendation service',
    baseUrl: `${req.protocol}://${req.get('host')}/api/ai`,
    endpoints: {
      'POST /suggest-copiers': {
        description: 'Get AI-powered copier recommendations based on requirements',
        rateLimit: '10 requests per minute per IP',
        maxRequestSize: '10KB',
        authentication: 'None required',
        requestFormat: {
          formData: {
            monthlyVolume: {
              total: 'number (0-1000000, optional) - Total monthly page volume',
              mono: 'number (0-1000000, optional) - Monthly monochrome pages',
              colour: 'number (0-1000000, optional) - Monthly color pages'
            },
            industryType: 'string (1-100 chars, optional) - Business industry type',
            type: 'string (A4|A3|Letter|Legal|Tabloid, optional) - Primary paper size',
            min_speed: 'number (1-200 PPM, optional) - Minimum printing speed required',
            max_lease_price: 'number (0-100000, optional) - Maximum monthly lease budget',
            required_functions: 'array of strings (max 20, optional) - Required printer functions',
            colour: 'string (Yes|No|Optional|Mono only|Colour required, optional) - Color printing preference',
            location: 'string (1-100 chars, optional) - Installation location'
          }
        },
        responseFormat: {
          success: 'boolean - Request success status',
          suggestions: 'array - AI-generated printer recommendations',
          metadata: 'object - Processing information and metrics'
        },
        examples: {
          request: {
            formData: {
              monthlyVolume: { total: 5000 },
              industryType: 'Healthcare',
              type: 'A4',
              required_functions: ['Print', 'Copy', 'Scan'],
              max_lease_price: 300
            }
          }
        }
      },
      'GET /health': {
        description: 'Check API health status and OpenAI connectivity',
        rateLimit: 'none',
        authentication: 'None required'
      },
      'GET /metrics': {
        description: 'Get API performance metrics and system information',
        rateLimit: 'none',
        authentication: 'None required'
      },
      'GET /docs': {
        description: 'Get this API documentation',
        rateLimit: 'none',
        authentication: 'None required'
      }
    },
    errorCodes: {
      400: 'Bad Request - Invalid input data',
      403: 'Forbidden - Request blocked by security rules',
      408: 'Timeout - AI service timeout',
      413: 'Payload Too Large - Request exceeds size limit',
      429: 'Too Many Requests - Rate limit exceeded',
      500: 'Internal Server Error - Service unavailable',
      503: 'Service Unavailable - AI service temporarily down'
    },
    support: {
      documentation: 'https://docs.tendorai.com',
      contact: 'support@tendorai.com'
    }
  });
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
