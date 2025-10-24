/**
 * Centralized Error Handler Middleware
 *
 * Handles all errors in the application and sends consistent error responses.
 *
 * Features:
 * - Different responses for development vs production
 * - Handles operational errors (AppError)
 * - Handles programming errors (unexpected errors)
 * - Special handling for common errors (MongoDB, JWT, Validation)
 * - Prevents leaking sensitive error details in production
 * - Structured logging with Winston
 */
import config from '../config/env.js';
import AppError from '../utils/AppError.js';
import logger from '../services/logger.js';

/**
 * Handle MongoDB CastError (invalid ObjectId)
 */
const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400);
};

/**
 * Handle MongoDB duplicate key error
 */
const handleDuplicateFieldsDB = (err) => {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];
  const message = `Duplicate field value: ${field} = '${value}'. Please use another value.`;
  return new AppError(message, 400);
};

/**
 * Handle MongoDB validation error
 */
const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new AppError(message, 400);
};

/**
 * Handle JWT invalid token error
 */
const handleJWTError = () => {
  return new AppError('Invalid token. Please log in again.', 401);
};

/**
 * Handle JWT expired token error
 */
const handleJWTExpiredError = () => {
  return new AppError('Your token has expired. Please log in again.', 401);
};

/**
 * Send error response in development
 */
const sendErrorDev = (err, req, res) => {
  // Log error with full details in development
  logger.logError(err, {
    requestId: req.id,
    url: req.originalUrl,
    method: req.method,
    userId: req.userId,
  });

  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack,
  });
};

/**
 * Send error response in production
 */
const sendErrorProd = (err, req, res) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    // Log operational error
    logger.warn('Operational error', {
      requestId: req.id,
      url: req.originalUrl,
      method: req.method,
      statusCode: err.statusCode,
      message: err.message,
      userId: req.userId,
    });

    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  }
  // Programming or unknown error: don't leak error details
  else {
    // Log programming error with full details
    logger.logError(err, {
      requestId: req.id,
      url: req.originalUrl,
      method: req.method,
      userId: req.userId,
      type: 'Programming Error',
    });

    // Send generic message
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong!',
    });
  }
};

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (config.isDevelopment()) {
    sendErrorDev(err, req, res);
  } else {
    let error = { ...err };
    error.message = err.message;
    error.name = err.name;

    // Handle specific error types
    if (error.name === 'CastError') error = handleCastErrorDB(error);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === 'ValidationError') error = handleValidationErrorDB(error);
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();

    sendErrorProd(error, req, res);
  }
};

export default errorHandler;
