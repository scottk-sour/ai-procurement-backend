import { EventEmitter } from 'events';
EventEmitter.defaultMaxListeners = 15;

/**
 * Winston Logger Configuration
 *
 * Production-ready logging with:
 * - Multiple log levels (error, warn, info, http, debug)
 * - File logging with daily rotation
 * - Console logging for development
 * - JSON format for production parsing
 * - Separate error log file
 * - Request tracing with IDs
 * - Structured logging
 */
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

// Determine log level based on environment
const level = () => {
  const env = config.app.env;
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'info';
};

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, requestId, userId, ...meta } = info;

    let log = `${timestamp} [${level}]`;

    if (requestId) {
      log += ` [${requestId}]`;
    }

    if (userId) {
      log += ` [User:${userId}]`;
    }

    log += `: ${message}`;

    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta, null, 2)}`;
    }

    return log;
  })
);

// Custom format for file output (JSON for easy parsing)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Console transport for development
const consoleTransport = new winston.transports.Console({
  format: consoleFormat,
});

// Daily rotate file transport for all logs
const fileTransport = new DailyRotateFile({
  filename: path.join(__dirname, '../logs/app-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: fileFormat,
});

// Daily rotate file transport for error logs only
const errorFileTransport = new DailyRotateFile({
  level: 'error',
  filename: path.join(__dirname, '../logs/error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  format: fileFormat,
});

// Create the logger
const logger = winston.createLogger({
  level: level(),
  levels,
  format: fileFormat,
  transports: [
    fileTransport,
    errorFileTransport,
  ],
  // Handle exceptions and rejections
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(__dirname, '../logs/exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: fileFormat,
    }),
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join(__dirname, '../logs/rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: fileFormat,
    }),
  ],
});

// Add console transport in development
if (config.isDevelopment()) {
  logger.add(consoleTransport);
}

// Create a stream object for Morgan HTTP logging
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

/**
 * Helper methods for common logging patterns
 */

// Log HTTP request
logger.logRequest = (req, message = 'HTTP Request') => {
  logger.http(message, {
    requestId: req.id,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.userId || req.user?.userId,
  });
};

// Log HTTP response
logger.logResponse = (req, res, message = 'HTTP Response') => {
  logger.http(message, {
    requestId: req.id,
    method: req.method,
    url: req.originalUrl,
    statusCode: res.statusCode,
    responseTime: Date.now() - req.startTime,
  });
};

// Log error with context
logger.logError = (error, context = {}) => {
  logger.error(error.message, {
    stack: error.stack,
    isOperational: error.isOperational,
    statusCode: error.statusCode,
    ...context,
  });
};

// Log database operation
logger.logDB = (operation, model, details = {}) => {
  logger.debug(`Database ${operation}`, {
    model,
    ...details,
  });
};

// Log authentication event
logger.logAuth = (event, userId, details = {}) => {
  logger.info(`Auth: ${event}`, {
    userId,
    ...details,
  });
};

// Log validation failure
logger.logValidation = (errors, context = {}) => {
  logger.warn('Validation failed', {
    errors,
    ...context,
  });
};

// Log API call to external service
logger.logAPI = (service, endpoint, details = {}) => {
  logger.info(`External API: ${service}`, {
    endpoint,
    ...details,
  });
};

export default logger;

