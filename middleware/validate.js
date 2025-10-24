/**
 * Validation Middleware
 *
 * Integrates express-validator with our custom error handling system.
 * Validates request data and formats errors using AppError.
 *
 * Usage:
 *   import { body } from 'express-validator';
 *   import { validate } from '../middleware/validate.js';
 *
 *   router.post('/signup',
 *     body('email').isEmail(),
 *     body('password').isLength({ min: 8 }),
 *     validate,
 *     signupController
 *   );
 */
import { validationResult } from 'express-validator';
import AppError from '../utils/AppError.js';

/**
 * Validation middleware that checks for validation errors
 * and formats them using AppError
 */
export const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    // Extract error messages
    const errorMessages = errors.array().map(error => {
      // Format: "field: message"
      return `${error.path}: ${error.msg}`;
    });

    // Create a single error message
    const message = `Validation failed. ${errorMessages.join('; ')}`;

    return next(new AppError(message, 400));
  }

  next();
};

/**
 * Sanitization helper - removes extra whitespace and trims strings
 */
export const sanitizeStrings = (req, res, next) => {
  // Sanitize body
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim();
      }
    });
  }

  // Sanitize query
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = req.query[key].trim();
      }
    });
  }

  next();
};

export default validate;
