# Logging Documentation

## Overview

TendorAI Backend uses **Winston** for production-ready structured logging with file rotation, multiple log levels, and environment-based configuration.

## Features

✅ **Multiple Log Levels** - error, warn, info, http, debug
✅ **File Logging with Daily Rotation** - Automatic log file management
✅ **Separate Error Logs** - Dedicated error log files
✅ **Request Tracing** - Unique request IDs for tracking
✅ **Structured Logging** - JSON format for easy parsing
✅ **Console Logging in Development** - Colored output for debugging
✅ **Production-Safe** - No sensitive data leakage
✅ **Exception & Rejection Handling** - Catches unhandled errors

## Architecture

```
Request → requestId middleware (adds req.id)
       ↓
Morgan HTTP logger → Winston stream
       ↓
Controller/Service logs → Winston logger
       ↓
Error → errorHandler → Winston logger
       ↓
Log Files (daily rotation)
```

## Log Levels

Winston uses the following log levels (priority):

| Level | Priority | Usage | Color |
|-------|----------|-------|-------|
| **error** | 0 | Errors that need immediate attention | Red |
| **warn** | 1 | Warning conditions, non-critical issues | Yellow |
| **info** | 2 | General information, significant events | Green |
| **http** | 3 | HTTP requests and responses | Magenta |
| **debug** | 4 | Detailed debugging information | Blue |

**Environment-based levels:**
- **Development:** `debug` (all logs)
- **Production:** `info` (info, warn, error)

## File Structure

```
logs/
├── app-2025-10-23.log              # All logs (info, warn, error, http)
├── error-2025-10-23.log            # Errors only
├── exceptions-2025-10-23.log       # Uncaught exceptions
└── rejections-2025-10-23.log       # Unhandled promise rejections
```

**Log Rotation:**
- **Date Pattern:** Daily (`YYYY-MM-DD`)
- **Max File Size:** 20MB
- **Retention:** 14 days for app logs, 30 days for errors
- **Format:** JSON (production), Colorized text (development)

## Logger Service

**File:** `/services/logger.js`

### Basic Methods

```javascript
import logger from './services/logger.js';

// Error logging
logger.error('Database connection failed', { database: 'mongodb' });

// Warning logging
logger.warn('API rate limit approaching', { usage: '95%' });

// Info logging
logger.info('User registered successfully', { userId: '123' });

// HTTP logging
logger.http('GET /api/users', { statusCode: 200 });

// Debug logging
logger.debug('Cache hit', { key: 'user:123' });
```

### Helper Methods

#### logRequest - Log HTTP Request
```javascript
logger.logRequest(req, 'Custom message');

// Logs:
// {
//   "timestamp": "2025-10-23 20:45:00",
//   "level": "http",
//   "message": "Custom message",
//   "requestId": "uuid-here",
//   "method": "POST",
//   "url": "/api/users",
//   "ip": "192.168.1.1",
//   "userAgent": "Mozilla/5.0...",
//   "userId": "123"
// }
```

#### logResponse - Log HTTP Response
```javascript
logger.logResponse(req, res);

// Logs:
// {
//   "timestamp": "2025-10-23 20:45:01",
//   "level": "http",
//   "message": "HTTP Response",
//   "requestId": "uuid-here",
//   "method": "POST",
//   "url": "/api/users",
//   "statusCode": 201,
//   "responseTime": 145
// }
```

#### logError - Log Error with Context
```javascript
try {
  await riskyOperation();
} catch (error) {
  logger.logError(error, {
    requestId: req.id,
    userId: req.userId,
    operation: 'riskyOperation'
  });
  throw error;
}

// Logs:
// {
//   "timestamp": "2025-10-23 20:45:00",
//   "level": "error",
//   "message": "Operation failed",
//   "stack": "Error: Operation failed\n    at...",
//   "isOperational": true,
//   "statusCode": 500,
//   "requestId": "uuid-here",
//   "userId": "123",
//   "operation": "riskyOperation"
// }
```

#### logDB - Log Database Operation
```javascript
logger.logDB('find', 'User', { email: 'user@example.com' });

// Logs:
// {
//   "level": "debug",
//   "message": "Database find",
//   "model": "User",
//   "email": "user@example.com"
// }
```

#### logAuth - Log Authentication Event
```javascript
logger.logAuth('login', userId, { method: 'email' });

// Logs:
// {
//   "level": "info",
//   "message": "Auth: login",
//   "userId": "123",
//   "method": "email"
// }
```

#### logValidation - Log Validation Failure
```javascript
logger.logValidation(errors, { endpoint: '/api/users' });

// Logs:
// {
//   "level": "warn",
//   "message": "Validation failed",
//   "errors": [...],
//   "endpoint": "/api/users"
// }
```

#### logAPI - Log External API Call
```javascript
logger.logAPI('OpenAI', '/v1/chat/completions', {
  model: 'gpt-4',
  tokens: 500
});

// Logs:
// {
//   "level": "info",
//   "message": "External API: OpenAI",
//   "endpoint": "/v1/chat/completions",
//   "model": "gpt-4",
//   "tokens": 500
// }
```

## Request ID Middleware

**File:** `/middleware/requestId.js`

Adds unique ID to each request for tracing.

**Features:**
- Generates unique UUID for each request
- Accepts client-provided request ID
- Adds `X-Request-ID` response header
- Stores request start time

**Usage:**
```javascript
import requestId from './middleware/requestId.js';
app.use(requestId);

// In controllers:
logger.info('Processing request', { requestId: req.id });
```

**Response Header:**
```
X-Request-ID: 550e8400-e29b-41d4-a716-446655440000
```

## Integration with Error Handler

**File:** `/middleware/errorHandler.js`

The error handler automatically logs all errors with context:

```javascript
// Development mode
logger.logError(err, {
  requestId: req.id,
  url: req.originalUrl,
  method: req.method,
  userId: req.userId,
});

// Production mode - Operational errors
logger.warn('Operational error', {
  requestId: req.id,
  url: req.originalUrl,
  statusCode: err.statusCode,
  message: err.message,
});

// Production mode - Programming errors
logger.logError(err, {
  requestId: req.id,
  url: req.originalUrl,
  type: 'Programming Error',
});
```

## Morgan HTTP Logging

Morgan is configured to use Winston stream:

**Development:**
```javascript
app.use(morgan('dev'));
// Output: GET /api/users 200 45ms - 1234 bytes
```

**Production:**
```javascript
app.use(morgan('combined', { stream: logger.stream }));
// Logs to Winston → JSON file
```

## Usage Examples

### Controller Logging

```javascript
import logger from '../services/logger.js';
import catchAsync from '../utils/catchAsync.js';

export const getUser = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  // Log the operation
  logger.debug('Fetching user', { userId: id, requestId: req.id });

  const user = await User.findById(id);

  if (!user) {
    logger.warn('User not found', { userId: id, requestId: req.id });
    return next(new AppError('User not found', 404));
  }

  logger.info('User fetched successfully', { userId: id, requestId: req.id });

  res.json({ user });
});
```

### Service Logging

```javascript
import logger from '../services/logger.js';

class EmailService {
  async sendEmail(to, subject, body) {
    try {
      logger.info('Sending email', { to, subject });

      await this.smtpClient.send({ to, subject, body });

      logger.info('Email sent successfully', { to, subject });
    } catch (error) {
      logger.logError(error, {
        to,
        subject,
        service: 'EmailService'
      });
      throw error;
    }
  }
}
```

### Database Operation Logging

```javascript
import logger from '../services/logger.js';

export const updateUser = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const updates = req.body;

  logger.logDB('updateOne', 'User', {
    userId: id,
    fields: Object.keys(updates)
  });

  const user = await User.findByIdAndUpdate(id, updates, { new: true });

  logger.info('User updated', { userId: id, requestId: req.id });

  res.json({ user });
});
```

### External API Logging

```javascript
import logger from '../services/logger.js';
import axios from 'axios';

export const generateAIResponse = async (prompt) => {
  logger.logAPI('OpenAI', '/v1/chat/completions', {
    prompt: prompt.substring(0, 50) + '...'
  });

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      { model: 'gpt-4', messages: [{ role: 'user', content: prompt }] },
      { headers: { 'Authorization': `Bearer ${config.openai.apiKey}` } }
    );

    logger.info('OpenAI response received', {
      tokens: response.data.usage.total_tokens
    });

    return response.data;
  } catch (error) {
    logger.logError(error, {
      service: 'OpenAI',
      endpoint: '/v1/chat/completions'
    });
    throw error;
  }
};
```

## Log Format

### Development Console

```
2025-10-23 20:45:00 [info] [550e8400-e29b-41d4-a716-446655440000] [User:123]: User registered successfully
2025-10-23 20:45:01 [http] [550e8400-e29b-41d4-a716-446655440000]: HTTP Request { "method": "POST", "url": "/api/users" }
2025-10-23 20:45:02 [error] [550e8400-e29b-41d4-a716-446655440000]: Database connection failed { "stack": "Error..." }
```

### Production JSON

```json
{
  "timestamp": "2025-10-23 20:45:00",
  "level": "info",
  "message": "User registered successfully",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "123",
  "method": "POST",
  "url": "/api/users"
}
```

## Monitoring Log Files

### View Logs in Real-Time

```bash
# All logs
tail -f logs/app-$(date +%Y-%m-%d).log

# Errors only
tail -f logs/error-$(date +%Y-%m-% d).log

# Follow logs with jq for pretty JSON
tail -f logs/app-$(date +%Y-%m-%d).log | jq '.'
```

### Search Logs

```bash
# Find all errors for a specific user
grep '"userId":"123"' logs/error-*.log

# Find all requests to specific endpoint
grep '"/api/users"' logs/app-*.log

# Find logs by request ID
grep '"requestId":"550e8400-e29b-41d4-a716-446655440000"' logs/app-*.log

# Find slow requests (> 1000ms)
grep -E '"responseTime":[0-9]{4,}' logs/app-*.log
```

### Analyze Logs

```bash
# Count errors by type
cat logs/error-*.log | jq -r '.message' | sort | uniq -c | sort -rn

# Average response time
cat logs/app-$(date +%Y-%m-%d).log | jq '.responseTime' | jq -s 'add/length'

# Most accessed endpoints
cat logs/app-*.log | jq -r '.url' | sort | uniq -c | sort -rn | head -10

# Error rate by hour
cat logs/error-$(date +%Y-%m-%d).log | jq -r '.timestamp' | cut -d' ' -f2 | cut -d':' -f1 | sort | uniq -c
```

## Best Practices

### 1. Use Appropriate Log Levels

```javascript
// ✅ Good
logger.error('Payment processing failed', { orderId, userId });
logger.warn('API rate limit at 90%', { remaining: 10 });
logger.info('User logged in', { userId });
logger.debug('Cache miss', { key: 'user:123' });

// ❌ Bad
logger.info('Payment processing failed');  // Should be error
logger.error('User clicked button');       // Should be debug or not logged
```

### 2. Include Context

```javascript
// ✅ Good
logger.error('Database query failed', {
  requestId: req.id,
  userId: req.userId,
  query: 'findById',
  model: 'User',
  error: error.message
});

// ❌ Bad
logger.error('Query failed');
```

### 3. Don't Log Sensitive Data

```javascript
// ✅ Good
logger.info('User authenticated', { userId, email });

// ❌ Bad
logger.info('User authenticated', { password, creditCard });
```

### 4. Use Request IDs

```javascript
// ✅ Good
logger.info('Processing payment', { requestId: req.id, orderId });

// ❌ Bad
logger.info('Processing payment', { orderId });  // Can't trace across services
```

### 5. Log Before and After Critical Operations

```javascript
// ✅ Good
logger.info('Starting payment processing', { orderId, amount });
try {
  await processPayment(orderId, amount);
  logger.info('Payment processed successfully', { orderId, amount });
} catch (error) {
  logger.logError(error, { orderId, amount, operation: 'payment' });
  throw error;
}

// ❌ Bad
await processPayment(orderId, amount);  // No logging
```

### 6. Don't Over-Log

```javascript
// ✅ Good
logger.debug('Cache lookup', { key });

// ❌ Bad
logger.info('Entering function');
logger.info('Creating variable');
logger.info('Checking condition');
// Too much noise
```

### 7. Use Helper Methods

```javascript
// ✅ Good
logger.logRequest(req);
logger.logError(error, context);
logger.logAuth('login', userId);

// ❌ Bad
logger.info(`${req.method} ${req.url}`, {
  ip: req.ip,
  userAgent: req.get('user-agent'),
  // Duplicating helper logic
});
```

## Security Considerations

### 1. Never Log Passwords

```javascript
// ✅ Good
logger.info('User registered', { email });

// ❌ Bad
logger.info('User registered', { email, password });
```

### 2. Never Log API Keys/Secrets

```javascript
// ✅ Good
logger.info('External API call', { service: 'OpenAI', endpoint });

// ❌ Bad
logger.info('External API call', { apiKey: config.openai.apiKey });
```

### 3. Never Log Credit Card Data

```javascript
// ✅ Good
logger.info('Payment processed', {
  orderId,
  last4: card.number.slice(-4)
});

// ❌ Bad
logger.info('Payment processed', {
  cardNumber: card.number,
  cvv: card.cvv
});
```

### 4. Be Careful with User Data

```javascript
// ✅ Good
logger.info('Profile updated', {
  userId,
  fields: Object.keys(updates)  // Log field names, not values
});

// ❌ Bad
logger.info('Profile updated', {
  userId,
  data: updates  // May contain PII
});
```

### 5. Sanitize Error Messages

```javascript
// ✅ Good
logger.error('Database error', {
  operation: 'save',
  model: 'User',
  errorType: error.name
});

// ❌ Bad
logger.error('Database error', {
  fullError: error,  // May contain connection strings, credentials
  query: sqlQuery    // May contain user data
});
```

## Log Rotation Configuration

Winston Daily Rotate File automatically manages log files:

**Configuration:**
```javascript
new DailyRotateFile({
  filename: 'logs/app-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',       // Rotate when file reaches 20MB
  maxFiles: '14d',      // Keep logs for 14 days
  format: fileFormat
});
```

**Old files are automatically:**
- Archived with date suffix
- Compressed (if configured)
- Deleted after retention period

## Troubleshooting

### Logs Not Appearing

**Check 1:** Verify logs directory exists
```bash
ls -la logs/
```

**Check 2:** Verify log level
```javascript
// In logger.js
console.log('Current log level:', logger.level);
```

**Check 3:** Check file permissions
```bash
ls -la logs/
# Should be writable
```

### Logs Too Verbose

**Solution:** Adjust log level in production

```javascript
// In config/env.js
export const config = {
  logging: {
    level: process.env.LOG_LEVEL || 'info'  // Change to 'warn' or 'error'
  }
};
```

### Large Log Files

**Solution:** Adjust rotation settings

```javascript
new DailyRotateFile({
  maxSize: '10m',     // Smaller max size
  maxFiles: '7d',     // Shorter retention
});
```

### Performance Impact

**Solution:** Log less in production

```javascript
// Only log significant events
if (config.isProduction()) {
  // Skip debug logs
  if (logLevel === 'debug') return;
}
```

## Integration with External Services

### Sentry Integration

```javascript
import * as Sentry from '@sentry/node';

// In errorHandler.js
if (config.isProduction() && !err.isOperational) {
  Sentry.captureException(err, {
    tags: { requestId: req.id },
    user: { id: req.userId },
  });
}
```

### Datadog Integration

```javascript
import { StatsD } from 'node-dogstatsd';

const statsD = new StatsD();

// Log metrics
logger.on('finish', (info) => {
  if (info.level === 'error') {
    statsD.increment('app.errors');
  }
});
```

### CloudWatch Integration

```javascript
import WinstonCloudWatch from 'winston-cloudwatch';

logger.add(new WinstonCloudWatch({
  logGroupName: 'tendorai-backend',
  logStreamName: config.app.env,
  awsRegion: 'us-east-1'
}));
```

## Testing Logging

```javascript
import logger from './services/logger.js';

// Test all log levels
logger.error('Test error message');
logger.warn('Test warning message');
logger.info('Test info message');
logger.http('Test HTTP message');
logger.debug('Test debug message');

// Check logs directory
ls -la logs/
cat logs/app-$(date +%Y-%m-%d).log
```

## Resources

- [Winston Documentation](https://github.com/winstonjs/winston)
- [Winston Daily Rotate File](https://github.com/winstonjs/winston-daily-rotate-file)
- [Morgan Documentation](https://github.com/expressjs/morgan)
- [Best Practices for Logging](https://www.datadoghq.com/blog/log-management-best-practices/)

---

**Last Updated:** October 23, 2025
**Version:** 1.0
**Author:** TendorAI Backend Team
