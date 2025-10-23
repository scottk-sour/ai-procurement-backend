/**
 * Quote Validation Schemas
 *
 * Validation rules for quote-related operations.
 * Uses express-validator for validation.
 */
import { body, param, query } from 'express-validator';

/**
 * Validation for creating a quote request
 */
export const createQuoteValidation = [
  body('productName')
    .trim()
    .notEmpty()
    .withMessage('Product name is required')
    .isLength({ min: 2, max: 200 })
    .withMessage('Product name must be between 2 and 200 characters'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description must not exceed 2000 characters'),

  body('quantity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer')
    .toInt(),

  body('budget')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Budget must be a positive number')
    .toFloat(),

  body('deliveryDate')
    .optional()
    .isISO8601()
    .withMessage('Delivery date must be a valid date')
    .toDate(),

  body('category')
    .optional()
    .trim()
    .isIn(['office-supplies', 'electronics', 'furniture', 'software', 'services', 'other'])
    .withMessage('Invalid category'),

  body('priority')
    .optional()
    .trim()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Priority must be one of: low, medium, high, urgent'),
];

/**
 * Validation for updating a quote
 */
export const updateQuoteValidation = [
  body('status')
    .optional()
    .trim()
    .isIn(['pending', 'accepted', 'rejected', 'completed', 'cancelled'])
    .withMessage('Invalid status value'),

  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes must not exceed 1000 characters'),

  body('vendorResponse')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Vendor response must not exceed 2000 characters'),

  body('quotedPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Quoted price must be a positive number')
    .toFloat(),
];

/**
 * Validation for accepting a quote
 */
export const acceptQuoteValidation = [
  body('quoteId')
    .trim()
    .notEmpty()
    .withMessage('Quote ID is required')
    .isMongoId()
    .withMessage('Invalid quote ID format'),

  body('vendorId')
    .trim()
    .notEmpty()
    .withMessage('Vendor ID is required')
    .isMongoId()
    .withMessage('Invalid vendor ID format'),

  body('acceptedPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Accepted price must be a positive number')
    .toFloat(),
];

/**
 * Validation for contacting vendor
 */
export const contactVendorValidation = [
  body('vendorId')
    .trim()
    .notEmpty()
    .withMessage('Vendor ID is required')
    .isMongoId()
    .withMessage('Invalid vendor ID format'),

  body('quoteId')
    .trim()
    .notEmpty()
    .withMessage('Quote ID is required')
    .isMongoId()
    .withMessage('Invalid quote ID format'),

  body('message')
    .trim()
    .notEmpty()
    .withMessage('Message is required')
    .isLength({ min: 10, max: 2000 })
    .withMessage('Message must be between 10 and 2000 characters'),

  body('subject')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Subject must not exceed 200 characters'),
];

/**
 * Validation for quote ID parameter
 */
export const quoteIdValidation = [
  param('id')
    .trim()
    .notEmpty()
    .withMessage('Quote ID is required')
    .isMongoId()
    .withMessage('Invalid quote ID format'),
];

/**
 * Validation for quote list filters
 */
export const quoteFiltersValidation = [
  query('status')
    .optional()
    .trim()
    .isIn(['pending', 'accepted', 'rejected', 'completed', 'cancelled'])
    .withMessage('Invalid status filter'),

  query('category')
    .optional()
    .trim()
    .isIn(['office-supplies', 'electronics', 'furniture', 'software', 'services', 'other'])
    .withMessage('Invalid category filter'),

  query('priority')
    .optional()
    .trim()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority filter'),

  query('fromDate')
    .optional()
    .isISO8601()
    .withMessage('From date must be a valid date')
    .toDate(),

  query('toDate')
    .optional()
    .isISO8601()
    .withMessage('To date must be a valid date')
    .toDate(),

  query('minBudget')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum budget must be a positive number')
    .toFloat(),

  query('maxBudget')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum budget must be a positive number')
    .toFloat(),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
];

/**
 * Validation for copier quote request
 */
export const copierQuoteValidation = [
  body('monthlyVolume')
    .optional()
    .isObject()
    .withMessage('Monthly volume must be an object'),

  body('monthlyVolume.total')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Total monthly volume must be a non-negative integer')
    .toInt(),

  body('industryType')
    .optional()
    .trim()
    .isIn(['Legal', 'Healthcare', 'Education', 'Manufacturing', 'Government', 'Retail', 'Other'])
    .withMessage('Invalid industry type'),

  body('colour')
    .optional()
    .trim()
    .isIn(['Color', 'Black & White', 'Both'])
    .withMessage('Colour must be one of: Color, Black & White, Both'),

  body('min_speed')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Minimum speed must be a positive integer')
    .toInt(),

  body('serviceType')
    .optional()
    .trim()
    .isIn(['Lease', 'Purchase', 'Rental', 'Production'])
    .withMessage('Invalid service type'),
];
