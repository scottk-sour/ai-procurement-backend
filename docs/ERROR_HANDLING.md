# Error Handling Documentation

## Overview

TendorAI Backend uses a centralized error handling system that provides consistent error responses, cleaner code, and better debugging capabilities.

## Architecture

### Components

1. **AppError** (`/utils/AppError.js`) - Custom error class
2. **catchAsync** (`/utils/catchAsync.js`) - Async error wrapper
3. **errorHandler** (`/middleware/errorHandler.js`) - Centralized error handler
4. **notFoundHandler** (`/middleware/notFoundHandler.js`) - 404 handler

### Flow Diagram

```
Controller throws AppError
         ↓
    catchAsync catches it
         ↓
    Passes to next(error)
         ↓
    errorHandler middleware
         ↓
    Sends formatted response
```

## Usage Guide

### 1. AppError Class

Custom error class that extends native Error with HTTP status codes.

**File:** `/utils/AppError.js`

**Properties:**
- `message` (string) - Error message
- `statusCode` (number) - HTTP status code (400, 401, 404, 500, etc.)
- `status` (string) - Either 'fail' (4xx) or 'error' (5xx)
- `isOperational` (boolean) - Always true for AppError

**Usage:**
```javascript
import AppError from '../utils/AppError.js';

// 400 Bad Request
throw new AppError('Invalid input data', 400);

// 401 Unauthorized
throw new AppError('Please log in to access this resource', 401);

// 403 Forbidden
throw new AppError('You do not have permission to perform this action', 403);

// 404 Not Found
throw new AppError('Resource not found', 404);

// 409 Conflict
throw new AppError('Resource already exists', 409);
```

### 2. catchAsync Wrapper

Eliminates try-catch blocks by automatically catching async errors.

**File:** `/utils/catchAsync.js`

**Before:**
```javascript
export const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
```

**After:**
```javascript
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/AppError.js';

export const getUser = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  res.json(user);
});
```

**Benefits:**
- No try-catch blocks needed
- Cleaner, more readable code
- Automatic error propagation
- Consistent error handling

### 3. Error Handler Middleware

Centralized error handler that formats all errors consistently.

**File:** `/middleware/errorHandler.js`

**Features:**
- Different responses for development vs production
- Handles operational errors (AppError)
- Handles programming errors (unexpected errors)
- Special handling for MongoDB errors
- Special handling for JWT errors
- Prevents leaking sensitive information in production

**Error Responses:**

**Development Mode:**
```json
{
  "status": "fail",
  "error": {
    "name": "AppError",
    "message": "User not found",
    "statusCode": 404
  },
  "message": "User not found",
  "stack": "Error: User not found\n    at ..."
}
```

**Production Mode (Operational Error):**
```json
{
  "status": "fail",
  "message": "User not found"
}
```

**Production Mode (Programming Error):**
```json
{
  "status": "error",
  "message": "Something went wrong!"
}
```

### 4. Not Found Handler

Catches all unmatched routes and creates 404 errors.

**File:** `/middleware/notFoundHandler.js`

**Response Example:**
```json
{
  "status": "fail",
  "message": "Cannot GET /api/nonexistent"
}
```

## Implementation in index.js

```javascript
import notFoundHandler from './middleware/notFoundHandler.js';
import errorHandler from './middleware/errorHandler.js';

// ... all routes ...

// 404 Not Found handler - must be placed after all routes
app.use(notFoundHandler);

// Centralized error handler - must be placed after notFoundHandler
app.use(errorHandler);
```

**Order matters!**
1. Define all routes first
2. Add notFoundHandler (catches unmatched routes)
3. Add errorHandler (catches all errors)

## Common Error Types

### MongoDB Errors

**CastError** (Invalid ObjectId):
```javascript
// Input: /api/users/invalid-id
// Response:
{
  "status": "fail",
  "message": "Invalid _id: invalid-id"
}
```

**Duplicate Key Error** (E11000):
```javascript
// Attempting to create user with existing email
// Response:
{
  "status": "fail",
  "message": "Duplicate field value: email = 'user@example.com'. Please use another value."
}
```

**Validation Error**:
```javascript
// Missing required fields
// Response:
{
  "status": "fail",
  "message": "Invalid input data. Path `name` is required. Path `email` is required."
}
```

### JWT Errors

**Invalid Token**:
```javascript
{
  "status": "fail",
  "message": "Invalid token. Please log in again."
}
```

**Expired Token**:
```javascript
{
  "status": "fail",
  "message": "Your token has expired. Please log in again."
}
```

## Refactoring Existing Controllers

### Step-by-Step Guide

**1. Add Imports**
```javascript
import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js';
import config from '../config/env.js';
```

**2. Replace process.env with config**
```javascript
// Before:
const token = jwt.sign(payload, process.env.JWT_SECRET);

// After:
const token = jwt.sign(payload, config.jwt.secret);
```

**3. Wrap function with catchAsync**
```javascript
// Before:
export const myFunction = async (req, res) => {

// After:
export const myFunction = catchAsync(async (req, res, next) => {
```

**4. Remove try-catch blocks**
```javascript
// Before:
try {
  const user = await User.findById(id);
  res.json(user);
} catch (error) {
  res.status(500).json({ message: error.message });
}

// After:
const user = await User.findById(id);
res.json(user);
```

**5. Replace res.status().json() errors with AppError**
```javascript
// Before:
if (!user) {
  return res.status(404).json({ message: 'User not found' });
}

// After:
if (!user) {
  return next(new AppError('User not found', 404));
}
```

### Complete Example

**Before:**
```javascript
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.name = name;
    user.email = email;
    await user.save();

    res.json({ message: 'User updated successfully', user });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
```

**After:**
```javascript
export const updateUser = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { name, email } = req.body;

  // Validation
  if (!name || !email) {
    return next(new AppError('Name and email are required', 400));
  }

  // Find user
  const user = await User.findById(id);
  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Update user
  user.name = name;
  user.email = email;
  await user.save();

  res.json({ message: 'User updated successfully', user });
});
```

## HTTP Status Codes Reference

### Success (2xx)
- **200 OK** - Successful GET, PUT, PATCH, DELETE
- **201 Created** - Successful POST (resource created)
- **204 No Content** - Successful DELETE (no response body)

### Client Errors (4xx)
- **400 Bad Request** - Invalid input data, validation errors
- **401 Unauthorized** - Missing or invalid authentication
- **403 Forbidden** - Authenticated but not authorized
- **404 Not Found** - Resource doesn't exist
- **409 Conflict** - Resource already exists (duplicate)
- **422 Unprocessable Entity** - Validation errors (alternative to 400)

### Server Errors (5xx)
- **500 Internal Server Error** - Unexpected programming errors

## Best Practices

### 1. Use Specific Error Messages
```javascript
// ❌ Bad
throw new AppError('Error', 400);

// ✅ Good
throw new AppError('Email is required', 400);
throw new AppError('Password must be at least 8 characters', 400);
```

### 2. Use Appropriate Status Codes
```javascript
// ❌ Bad - Using 500 for validation error
if (!email) throw new AppError('Email required', 500);

// ✅ Good - Using 400 for validation error
if (!email) throw new AppError('Email required', 400);
```

### 3. Don't Catch Errors in Controllers
```javascript
// ❌ Bad - Catching errors in controller
export const getUser = catchAsync(async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    res.json(user);
  } catch (error) {
    next(error);
  }
});

// ✅ Good - Let catchAsync handle it
export const getUser = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id);
  res.json(user);
});
```

### 4. Validate Before Database Operations
```javascript
// ✅ Good - Validate first
if (!email || !password) {
  return next(new AppError('Email and password are required', 400));
}

const user = await User.findOne({ email });
```

### 5. Use return with next()
```javascript
// ❌ Bad - Missing return
if (!user) {
  next(new AppError('User not found', 404));
}
res.json(user); // This will still execute!

// ✅ Good - Using return
if (!user) {
  return next(new AppError('User not found', 404));
}
res.json(user);
```

### 6. Log Errors Appropriately
```javascript
// ✅ Good - Log for debugging but don't expose to client
console.log('Debug info:', userId, email);

if (!user) {
  return next(new AppError('User not found', 404));
}
```

## Testing Error Handling

### Test 1: 404 Error
```bash
curl http://localhost:5000/api/nonexistent
```

**Expected Response:**
```json
{
  "status": "fail",
  "message": "Cannot GET /api/nonexistent"
}
```

### Test 2: Validation Error
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Response:**
```json
{
  "status": "fail",
  "message": "Email and password are required."
}
```

### Test 3: Invalid MongoDB ID
```bash
curl http://localhost:5000/api/users/invalid-id \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response (Production):**
```json
{
  "status": "fail",
  "message": "Invalid _id: invalid-id"
}
```

### Test 4: Expired JWT
```bash
curl http://localhost:5000/api/users/profile \
  -H "Authorization: Bearer expired.jwt.token"
```

**Expected Response:**
```json
{
  "status": "fail",
  "message": "Your token has expired. Please log in again."
}
```

## Migration Checklist

- [ ] Create AppError class
- [ ] Create catchAsync wrapper
- [ ] Create errorHandler middleware
- [ ] Create notFoundHandler middleware
- [ ] Update index.js to use error handlers
- [ ] Refactor one controller to demonstrate pattern
- [ ] Test error responses
- [ ] Gradually refactor remaining controllers
- [ ] Remove old try-catch blocks
- [ ] Update all res.status().json() errors to AppError
- [ ] Replace process.env with config where needed

## Files Modified

### Created
- `/utils/AppError.js`
- `/utils/catchAsync.js`
- `/middleware/errorHandler.js`
- `/middleware/notFoundHandler.js`

### Modified
- `/index.js` - Added error handler imports and middleware
- `/controllers/userController.js` - Refactored to use new pattern

### To Migrate
- All remaining controllers in `/controllers/`
- Any route files with inline error handling

## Next Steps

1. **Week 3-4**: Gradually refactor remaining controllers
   - Start with frequently-used controllers
   - Test each controller after refactoring
   - Ensure all API endpoints work correctly

2. **Week 5**: Add custom error types
   - `ValidationError` for input validation
   - `AuthenticationError` for auth failures
   - `AuthorizationError` for permission issues

3. **Week 6**: Enhance error logging
   - Integrate with Sentry for error tracking
   - Add request ID to errors for tracing
   - Log errors with context (user, endpoint, etc.)

4. **Week 7**: Add error metrics
   - Track error rates by endpoint
   - Monitor error types
   - Set up alerts for error spikes

## Resources

- [Express Error Handling](https://expressjs.com/en/guide/error-handling.html)
- [Node.js Error Best Practices](https://nodejs.org/en/docs/guides/error-handling/)
- [HTTP Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)

## Support

For questions or issues with error handling:
1. Check this documentation
2. Review userController.js for examples
3. Test with the provided curl commands
4. Check error handler logs in development mode

---

**Last Updated:** October 23, 2025
**Version:** 1.0
**Author:** TendorAI Backend Team
