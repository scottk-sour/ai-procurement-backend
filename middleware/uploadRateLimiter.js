import rateLimit from 'express-rate-limit';
import logger from '../services/logger.js';

// General upload rate limiter (10 uploads per 15 minutes)
export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 uploads per window
  message: {
    success: false,
    message: 'Too many file uploads. Please try again in 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true, // Don't count failed uploads
  handler: (req, res) => {
    logger.warn('Upload rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent')
    });
    res.status(429).json({
      success: false,
      message: 'Too many file uploads. Please try again in 15 minutes.'
    });
  }
});

// Vendor product upload rate limiter (5 uploads per hour)
export const vendorUploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 uploads per window
  message: {
    success: false,
    message: 'Too many product uploads. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true
});

export default uploadRateLimiter;
