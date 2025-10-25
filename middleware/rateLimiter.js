/**
 * Rate Limiting Middleware
 *
 * Protects API endpoints from abuse by limiting the number of requests.
 *
 * Features:
 * - General API rate limiting (100 requests per 15 minutes)
 * - Strict auth rate limiting (5 login attempts per hour)
 * - Account creation rate limiting (3 signups per hour)
 * - Custom error messages
 * - Integration with logging
 * - Trust proxy support for deployment platforms
 *
 * Usage:
 *   import { generalLimiter, authLimiter, createAccountLimiter } from './middleware/rateLimiter.js';
 *
 *   app.use('/api/', generalLimiter);
 *   app.use('/api/auth/login', authLimiter);
 *   app.use('/api/users/signup', createAccountLimiter);
 */
import rateLimit from 'express-rate-limit';
import logger from '../services/logger.js';
import config from '../config/env.js';

/**
 * General API Rate Limiter
 * Applies to all API endpoints
 *
 * Limits: 100 requests per 15 minutes per IP
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    status: 'error',
    message: 'Too many requests from this IP, please try again after 15 minutes.',
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  // Trust proxy for deployment platforms (Render, Heroku, etc.)
  trustProxy: true,
  // Skip rate limiting in development (optional)
  skip: (req) => config.isDevelopment() && req.ip === '127.0.0.1',
  // Log when rate limit is hit
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      requestId: req.id,
    });
    res.status(429).json({
      status: 'error',
      message: 'Too many requests from this IP, please try again after 15 minutes.',
    });
  },
});

/**
 * Authentication Rate Limiter
 * Stricter limits for login endpoints to prevent brute force attacks
 *
 * Limits: 5 requests per hour per IP
 */
export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 login requests per hour
  message: {
    status: 'error',
    message: 'Too many login attempts, please try again after an hour.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true,
  skipSuccessfulRequests: true, // Don't count successful logins
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      email: req.body?.email,
      requestId: req.id,
    });
    res.status(429).json({
      status: 'error',
      message: 'Too many login attempts from this IP, please try again after an hour.',
    });
  },
});

/**
 * Account Creation Rate Limiter
 * Very strict limits for signup to prevent spam accounts
 *
 * Limits: 3 requests per hour per IP
 */
export const createAccountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 account creations per hour
  message: {
    status: 'error',
    message: 'Too many accounts created from this IP, please try again after an hour.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true,
  skipSuccessfulRequests: false, // Count all signup attempts
  handler: (req, res) => {
    logger.warn('Account creation rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      email: req.body?.email,
      requestId: req.id,
    });
    res.status(429).json({
      status: 'error',
      message: 'Too many accounts created from this IP, please try again after an hour.',
    });
  },
});

/**
 * File Upload Rate Limiter
 * Moderate limits for file uploads to prevent storage abuse
 *
 * Limits: 10 uploads per hour per IP
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 uploads per hour
  message: {
    status: 'error',
    message: 'Too many file uploads, please try again after an hour.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true,
  handler: (req, res) => {
    logger.warn('Upload rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userId: req.userId,
      requestId: req.id,
    });
    res.status(429).json({
      status: 'error',
      message: 'Too many file uploads from this IP, please try again after an hour.',
    });
  },
});

/**
 * API Key Rate Limiter
 * For endpoints that use API keys instead of user authentication
 *
 * Limits: 1000 requests per hour per API key
 */
export const apiKeyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000, // Higher limit for API key users
  keyGenerator: (req) => {
    // Use API key as the rate limit key instead of IP
    return req.headers['x-api-key'] || req.ip;
  },
  message: {
    status: 'error',
    message: 'API rate limit exceeded, please try again after an hour.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true,
  handler: (req, res) => {
    logger.warn('API key rate limit exceeded', {
      apiKey: req.headers['x-api-key']?.substring(0, 8) + '...',
      path: req.path,
      requestId: req.id,
    });
    res.status(429).json({
      status: 'error',
      message: 'API rate limit exceeded, please try again after an hour.',
    });
  },
});

/**
 * Create a custom rate limiter with specific configuration
 *
 * @param {Object} options - Rate limit configuration
 * @returns {Function} Rate limiter middleware
 */
export const createCustomLimiter = (options) => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000,
    max: options.max || 100,
    message: options.message || {
      status: 'error',
      message: 'Too many requests, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: true,
    handler: (req, res) => {
      logger.warn(`Custom rate limit exceeded: ${options.name || 'unknown'}`, {
        ip: req.ip,
        path: req.path,
        requestId: req.id,
      });
      res.status(429).json(options.message);
    },
    ...options,
  });
};

export default {
  generalLimiter,
  authLimiter,
  createAccountLimiter,
  uploadLimiter,
  apiKeyLimiter,
  createCustomLimiter,
};
