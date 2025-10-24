# Input Validation Documentation

## Overview

TendorAI Backend uses `express-validator` for input validation to ensure data quality, security, and consistency. All API endpoints validate incoming data before processing.

## Architecture

### Components

1. **express-validator** - Validation library
2. **validate middleware** (`/middleware/validate.js`) - Processes validation results
3. **Validation schemas** (`/validators/`) - Reusable validation rules
4. **AppError integration** - Consistent error responses

### Flow Diagram

```
Request with data
       ↓
Validation rules (express-validator)
       ↓
validate middleware
       ↓
Validation errors? → Yes → AppError (400) → errorHandler → Client
       ↓ No
Controller
       ↓
Response
```

## Why Input Validation?

### Security Benefits
- **Prevents SQL/NoSQL Injection** - Validates and sanitizes input
- **Prevents XSS Attacks** - Sanitizes HTML and scripts
- **Prevents Buffer Overflow** - Enforces length limits
- **Prevents Type Coercion Attacks** - Enforces correct data types

### Data Quality Benefits
- **Consistent Data** - Ensures data matches expected format
- **Better Database Performance** - Reduces invalid queries
- **Clear Error Messages** - Users know exactly what's wrong
- **Reduced Debugging** - Catches issues early

### Production Benefits
- **Lower Server Load** - Rejects bad requests early
- **Better API Documentation** - Validation rules document API
- **Easier Testing** - Clear validation rules to test
- **Client-Side Hints** - Validation messages guide UI

## Files Structure

```
├── middleware/
│   └── validate.js           # Validation middleware
├── validators/
│   ├── userValidator.js      # User validation schemas
│   └── quoteValidator.js     # Quote validation schemas
└── routes/
    ├── userRoutes.js         # Uses validation
    └── quoteRoutes.js        # Uses validation
```

## Core Middleware

### validate.js

**File:** `/middleware/validate.js`

**Features:**
- Checks validation results from express-validator
- Formats errors using AppError
- Returns 400 status for validation failures
- Integrates with centralized error handling

**Usage:**
```javascript
import { validate } from '../middleware/validate.js';
import { body } from 'express-validator';

router.post('/endpoint',
  body('email').isEmail(),
  body('password').isLength({ min: 8 }),
  validate,  // <-- Add this after validation rules
  controller
);
```

**Error Response Format:**
```json
{
  "status": "fail",
  "message": "Validation failed. email: Must be a valid email address; password: Password must be at least 8 characters long"
}
```

## Validation Schemas

### User Validator

**File:** `/validators/userValidator.js`

#### signupValidation
Validates user registration data.

**Rules:**
- `name`: Required, 2-100 characters
- `email`: Required, valid email format, normalized
- `password`: Required, min 8 characters, must contain uppercase, lowercase, and number
- `company`: Optional, max 200 characters

**Usage:**
```javascript
import { signupValidation } from '../validators/userValidator.js';
import { validate } from '../middleware/validate.js';

router.post('/signup', signupValidation, validate, signupController);
```

**Valid Request:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "Password123",
  "company": "Acme Corp"
}
```

**Invalid Request:**
```json
{
  "name": "J",
  "email": "invalid-email",
  "password": "weak"
}
```

**Error Response:**
```json
{
  "status": "fail",
  "message": "Validation failed. name: Name must be between 2 and 100 characters; email: Must be a valid email address; password: Password must be at least 8 characters long"
}
```

#### loginValidation
Validates user login data.

**Rules:**
- `email`: Required, valid email format
- `password`: Required

**Usage:**
```javascript
router.post('/login', loginValidation, validate, loginController);
```

#### updateProfileValidation
Validates profile update data (all fields optional).

**Rules:**
- `name`: Optional, 2-100 characters if provided
- `email`: Optional, valid email format if provided
- `company`: Optional, max 200 characters if provided

#### fileUploadValidation
Validates file upload metadata.

**Rules:**
- `documentType`: Optional, must be 'contract', 'invoice', or 'others'

#### userIdValidation
Validates MongoDB ObjectId in URL parameters.

**Rules:**
- `id`: Required, valid MongoDB ObjectId format

**Usage:**
```javascript
router.get('/users/:id', userIdValidation, validate, getUserController);
```

#### paginationValidation
Validates pagination query parameters.

**Rules:**
- `page`: Optional, positive integer, defaults to 1
- `limit`: Optional, integer between 1-100, defaults to 10

**Usage:**
```javascript
router.get('/users', paginationValidation, validate, listUsersController);
```

### Quote Validator

**File:** `/validators/quoteValidator.js`

#### createQuoteValidation
Validates quote request creation.

**Rules:**
- `productName`: Required, 2-200 characters
- `description`: Optional, max 2000 characters
- `quantity`: Optional, positive integer
- `budget`: Optional, positive number
- `deliveryDate`: Optional, valid ISO8601 date
- `category`: Optional, must be valid category
- `priority`: Optional, 'low', 'medium', 'high', or 'urgent'

**Usage:**
```javascript
router.post('/quotes/request', createQuoteValidation, validate, createQuoteController);
```

#### updateQuoteValidation
Validates quote updates.

**Rules:**
- `status`: Optional, must be valid status
- `notes`: Optional, max 1000 characters
- `vendorResponse`: Optional, max 2000 characters
- `quotedPrice`: Optional, positive number

#### acceptQuoteValidation
Validates quote acceptance.

**Rules:**
- `quoteId`: Required, valid MongoDB ObjectId
- `vendorId`: Required, valid MongoDB ObjectId
- `acceptedPrice`: Optional, positive number

#### contactVendorValidation
Validates vendor contact form.

**Rules:**
- `vendorId`: Required, valid MongoDB ObjectId
- `quoteId`: Required, valid MongoDB ObjectId
- `message`: Required, 10-2000 characters
- `subject`: Optional, max 200 characters

#### quoteIdValidation
Validates quote ID in URL parameters.

**Rules:**
- `id`: Required, valid MongoDB ObjectId

#### quoteFiltersValidation
Validates quote list filter query parameters.

**Rules:**
- `status`: Optional, must be valid status
- `category`: Optional, must be valid category
- `priority`: Optional, must be valid priority
- `fromDate`: Optional, valid ISO8601 date
- `toDate`: Optional, valid ISO8601 date
- `minBudget`: Optional, positive number
- `maxBudget`: Optional, positive number
- `page`: Optional, positive integer
- `limit`: Optional, 1-100

#### copierQuoteValidation
Validates copier-specific quote requests.

**Rules:**
- `monthlyVolume`: Optional object with numeric properties
- `industryType`: Optional, must be valid industry
- `colour`: Optional, 'Color', 'Black & White', or 'Both'
- `min_speed`: Optional, positive integer
- `serviceType`: Optional, must be valid service type

## Common Validation Methods

### String Validation

```javascript
import { body } from 'express-validator';

// Required string
body('name').notEmpty().withMessage('Name is required')

// Length constraints
body('name').isLength({ min: 2, max: 100 })

// Trim whitespace
body('name').trim()

// Lowercase
body('email').toLowerCase()

// Specific values (enum)
body('status').isIn(['active', 'inactive'])

// Regex pattern
body('phone').matches(/^\d{10}$/)
```

### Email Validation

```javascript
// Basic email
body('email').isEmail().withMessage('Invalid email')

// With normalization
body('email')
  .trim()
  .isEmail()
  .normalizeEmail()  // Converts to lowercase, removes dots from Gmail
```

### Number Validation

```javascript
// Integer
body('age').isInt({ min: 0, max: 120 })

// Float
body('price').isFloat({ min: 0 })

// Convert to number
body('quantity').toInt()
body('price').toFloat()
```

### Date Validation

```javascript
// ISO8601 format
body('date').isISO8601().toDate()

// After specific date
body('endDate').isAfter(new Date().toISOString())

// Before specific date
body('birthDate').isBefore(new Date().toISOString())
```

### MongoDB ObjectId Validation

```javascript
import { param } from 'express-validator';

// URL parameter
param('id').isMongoId().withMessage('Invalid ID format')

// Body field
body('userId').isMongoId()
```

### Array Validation

```javascript
// Array of strings
body('tags').isArray().withMessage('Tags must be an array')
body('tags.*').trim().notEmpty()

// Array length
body('items').isArray({ min: 1, max: 10 })
```

### Object Validation

```javascript
// Object exists
body('address').isObject()

// Nested fields
body('address.street').notEmpty()
body('address.city').notEmpty()
body('address.zipCode').matches(/^\d{5}$/)
```

### Optional Fields

```javascript
// Only validate if present
body('company')
  .optional()
  .trim()
  .isLength({ max: 200 })

// Optional with default
body('role')
  .optional()
  .default('user')
  .isIn(['user', 'admin'])
```

## Custom Validation

### Custom Validator Function

```javascript
body('password')
  .custom((value, { req }) => {
    if (value !== req.body.confirmPassword) {
      throw new Error('Passwords must match');
    }
    return true;
  })
```

### Async Custom Validator

```javascript
body('email')
  .custom(async (value) => {
    const user = await User.findOne({ email: value });
    if (user) {
      throw new Error('Email already in use');
    }
    return true;
  })
```

### Conditional Validation

```javascript
body('companyTaxId')
  .if(body('accountType').equals('business'))
  .notEmpty()
  .withMessage('Tax ID required for business accounts')
```

## Query Parameter Validation

```javascript
import { query } from 'express-validator';

router.get('/users',
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().trim().escape(),
  query('sortBy').optional().isIn(['name', 'email', 'createdAt']),
  query('order').optional().isIn(['asc', 'desc']),
  validate,
  listUsersController
);
```

## URL Parameter Validation

```javascript
import { param } from 'express-validator';

router.get('/users/:id',
  param('id').isMongoId(),
  validate,
  getUserController
);

router.get('/posts/:year/:month',
  param('year').isInt({ min: 2000, max: 2100 }),
  param('month').isInt({ min: 1, max: 12 }),
  validate,
  getPostsController
);
```

## Sanitization

### Built-in Sanitizers

```javascript
// Trim whitespace
body('name').trim()

// Remove extra spaces
body('description').trim().blacklist('  ')

// Escape HTML
body('bio').escape()

// Convert to lowercase
body('email').toLowerCase()

// Normalize email
body('email').normalizeEmail()

// Remove non-numeric
body('phone').blacklist('-() ')

// Convert to boolean
body('isActive').toBoolean()
```

### Custom Sanitizers

```javascript
body('tags')
  .customSanitizer((value) => {
    if (Array.isArray(value)) {
      return value.map(tag => tag.trim().toLowerCase());
    }
    return [];
  })
```

## Error Messages

### Default Messages

```javascript
body('email').isEmail()
// Default: "Invalid value"
```

### Custom Messages

```javascript
body('email')
  .isEmail()
  .withMessage('Please provide a valid email address')
```

### Dynamic Messages

```javascript
body('age')
  .isInt({ min: 18 })
  .withMessage((value, { path }) => {
    return `${path} must be at least 18, got ${value}`;
  })
```

### Field-Specific Messages

```javascript
body('password')
  .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
  .matches(/[A-Z]/).withMessage('Password must contain uppercase letter')
  .matches(/[a-z]/).withMessage('Password must contain lowercase letter')
  .matches(/\d/).withMessage('Password must contain number')
```

## Best Practices

### 1. Validate Early

```javascript
// ✅ Good - Validation before controller
router.post('/signup',
  signupValidation,
  validate,
  signupController
);

// ❌ Bad - Validation in controller
router.post('/signup', async (req, res) => {
  if (!req.body.email) return res.status(400).json({...});
  // ...
});
```

### 2. Reuse Validation Schemas

```javascript
// ✅ Good - Reusable validation
export const emailValidation = body('email')
  .trim()
  .isEmail()
  .normalizeEmail();

router.post('/signup', emailValidation, validate, ...);
router.post('/login', emailValidation, validate, ...);
```

### 3. Always Use validate Middleware

```javascript
// ✅ Good
router.post('/users',
  userValidation,
  validate,  // <-- Don't forget this
  createUser
);

// ❌ Bad - Validation rules without validate middleware
router.post('/users',
  userValidation,
  createUser  // Validation won't actually run!
);
```

### 4. Sanitize Input

```javascript
// ✅ Good - Trim and sanitize
body('name').trim().escape()
body('email').trim().normalizeEmail()

// ❌ Bad - No sanitization
body('name').notEmpty()
body('email').isEmail()
```

### 5. Use Specific Validators

```javascript
// ✅ Good - Specific validator
body('email').isEmail()
body('url').isURL()
body('id').isMongoId()

// ❌ Bad - Generic validator
body('email').matches(/.../)
body('url').matches(/.../)
```

### 6. Set Reasonable Limits

```javascript
// ✅ Good - Prevents abuse
body('description').isLength({ max: 2000 })
query('limit').isInt({ min: 1, max: 100 })

// ❌ Bad - No limits
body('description').isString()
query('limit').isInt()
```

### 7. Validate Data Types

```javascript
// ✅ Good - Enforce types
body('age').isInt().toInt()
body('price').isFloat().toFloat()
body('active').isBoolean().toBoolean()

// ❌ Bad - Accept any type
body('age').notEmpty()
body('price').notEmpty()
```

## Testing Validation

### Valid Request Test

```bash
curl -X POST http://localhost:5000/api/users/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "Password123"
  }'
```

**Expected:** 201 Created

### Missing Required Field

```bash
curl -X POST http://localhost:5000/api/users/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "Password123"
  }'
```

**Expected:** 400 Bad Request
```json
{
  "status": "fail",
  "message": "Validation failed. name: Name is required"
}
```

### Invalid Email Format

```bash
curl -X POST http://localhost:5000/api/users/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "invalid-email",
    "password": "Password123"
  }'
```

**Expected:** 400 Bad Request
```json
{
  "status": "fail",
  "message": "Validation failed. email: Must be a valid email address"
}
```

### Weak Password

```bash
curl -X POST http://localhost:5000/api/users/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "weak"
  }'
```

**Expected:** 400 Bad Request
```json
{
  "status": "fail",
  "message": "Validation failed. password: Password must be at least 8 characters long; password: Password must contain at least one uppercase letter, one lowercase letter, and one number"
}
```

## Common Validation Patterns

### Email + Password Authentication

```javascript
export const authValidation = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Must be a valid email')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
];
```

### Pagination

```javascript
export const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt()
];
```

### Date Range

```javascript
export const dateRangeValidation = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be valid')
    .toDate(),

  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be valid')
    .toDate()
    .custom((endDate, { req }) => {
      if (req.query.startDate && endDate < new Date(req.query.startDate)) {
        throw new Error('End date must be after start date');
      }
      return true;
    })
];
```

### File Upload

```javascript
export const fileUploadValidation = [
  body('documentType')
    .optional()
    .isIn(['contract', 'invoice', 'receipt', 'other'])
    .withMessage('Invalid document type'),

  // Note: File validation happens in multer middleware
];
```

## Security Considerations

### 1. Always Validate on Server

```javascript
// ✅ Client-side validation is UX, not security
// ✅ Always validate on server even if client validates
router.post('/signup',
  signupValidation,  // Server-side validation required
  validate,
  signupController
);
```

### 2. Sanitize HTML Input

```javascript
// ✅ Good - Escape HTML
body('comment').trim().escape()

// ❌ Bad - No sanitization (XSS risk)
body('comment').notEmpty()
```

### 3. Limit Input Length

```javascript
// ✅ Good - Prevents buffer overflow
body('description').isLength({ max: 2000 })

// ❌ Bad - No limit
body('description').isString()
```

### 4. Validate Data Types

```javascript
// ✅ Good - Type validation
body('age').isInt().toInt()

// ❌ Bad - No type check (NoSQL injection risk)
body('age').notEmpty()
```

### 5. Use Allowlists (Not Blocklists)

```javascript
// ✅ Good - Allowlist of valid values
body('role').isIn(['user', 'admin'])

// ❌ Bad - Accepting anything
body('role').notEmpty()
```

## Migration from Old Validation

### Before (Manual Validation)

```javascript
router.post('/signup', async (req, res) => {
  if (!req.body.email) {
    return res.status(400).json({ message: 'Email required' });
  }
  if (!/\S+@\S+\.\S+/.test(req.body.email)) {
    return res.status(400).json({ message: 'Invalid email' });
  }
  // ... more validation
});
```

### After (express-validator)

```javascript
import { signupValidation } from '../validators/userValidator.js';
import { validate } from '../middleware/validate.js';

router.post('/signup',
  signupValidation,
  validate,
  signupController
);
```

## Resources

- [express-validator Documentation](https://express-validator.github.io/docs/)
- [Validator.js (underlying library)](https://github.com/validatorjs/validator.js)
- [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)

---

**Last Updated:** October 23, 2025
**Version:** 1.0
**Author:** TendorAI Backend Team
