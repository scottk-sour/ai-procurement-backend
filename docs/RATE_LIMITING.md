# Rate Limiting Documentation

## Overview

TendorAI Backend uses `express-rate-limit` to protect API endpoints from abuse, brute force attacks, and DDoS attempts. Rate limiting restricts the number of requests a client can make within a specific time window.

## Why Rate Limiting?

### Security Benefits
✅ **Prevents Brute Force Attacks** - Limits login attempts to prevent password guessing
✅ **Stops Account Enumeration** - Slows down attackers trying to find valid accounts
✅ **Prevents DDoS** - Protects server from being overwhelmed
✅ **Blocks Spam Accounts** - Limits account creation to prevent bots
✅ **Reduces API Abuse** - Prevents excessive API usage

### Performance Benefits
✅ **Fair Resource Distribution** - Ensures all users get server resources
✅ **Reduces Server Load** - Prevents single clients from overloading
✅ **Improves Stability** - Predictable load patterns
✅ **Cost Control** - Limits bandwidth and compute usage

## Rate Limiter Types

### 1. General API Limiter
**Applied to:** All `/api/*` endpoints
**Limit:** 100 requests per 15 minutes per IP
**Purpose:** General API protection

```javascript
import { generalLimiter } from './middleware/rateLimiter.js';
app.use('/api/', generalLimiter);
```

**Response when exceeded:**
```json
{
  "status": "error",
  "message": "Too many requests from this IP, please try again after 15 minutes."
}
```

**Headers returned:**
```
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1698156000
```

---

### 2. Authentication Limiter
**Applied to:** Login endpoints
**Limit:** 5 requests per hour per IP
**Purpose:** Prevent brute force password attacks

**Endpoints protected:**
- `POST /api/auth/login`
- `POST /api/auth/vendor-login`
- `POST /api/users/login`

```javascript
import { authLimiter } from './middleware/rateLimiter.js';
router.post('/login', authLimiter, loginHandler);
```

**Features:**
- ✅ Skips successful logins (only failed attempts count)
- ✅ Tracks by IP address
- ✅ Logged for security monitoring

**Response when exceeded:**
```json
{
  "status": "error",
  "message": "Too many login attempts from this IP, please try again after an hour."
}
```

---

### 3. Account Creation Limiter
**Applied to:** Signup/registration endpoints
**Limit:** 3 requests per hour per IP
**Purpose:** Prevent spam account creation

**Endpoints protected:**
- `POST /api/auth/register`
- `POST /api/auth/vendor-register`
- `POST /api/users/signup`

```javascript
import { createAccountLimiter } from './middleware/rateLimiter.js';
router.post('/signup', createAccountLimiter, signupHandler);
```

**Features:**
- ✅ Very strict (3 per hour)
- ✅ All attempts counted (even successful)
- ✅ Prevents bot account creation

**Response when exceeded:**
```json
{
  "status": "error",
  "message": "Too many accounts created from this IP, please try again after an hour."
}
```

---

### 4. File Upload Limiter
**Applied to:** File upload endpoints
**Limit:** 10 uploads per hour per IP
**Purpose:** Prevent storage abuse

**Endpoints protected:**
- `POST /api/users/upload`
- `POST /api/vendors/upload`

```javascript
import { uploadLimiter } from './middleware/rateLimiter.js';
router.post('/upload', uploadLimiter, uploadHandler);
```

**Response when exceeded:**
```json
{
  "status": "error",
  "message": "Too many file uploads, please try again after an hour."
}
```

---

### 5. API Key Limiter
**Applied to:** API key authenticated endpoints
**Limit:** 1000 requests per hour per API key
**Purpose:** Higher limits for programmatic access

```javascript
import { apiKeyLimiter } from './middleware/rateLimiter.js';
router.use('/api/v1/', apiKeyLimiter);
```

**Key generation:**
- Uses `X-API-Key` header as rate limit key
- Falls back to IP if no API key present

**Response when exceeded:**
```json
{
  "status": "error",
  "message": "API rate limit exceeded, please try again after an hour."
}
```

---

## Implementation Details

### Trust Proxy
Rate limiting works correctly behind reverse proxies (Nginx, Render, Heroku):

```javascript
// In index.js
app.set('trust proxy', 1);

// In rateLimiter.js
export const generalLimiter = rateLimit({
  trustProxy: true,
  // ...
});
```

This ensures rate limiting uses the real client IP, not the proxy IP.

### Headers

Rate limit information is returned in standard headers:

```http
RateLimit-Limit: 100          # Max requests allowed
RateLimit-Remaining: 45        # Requests remaining
RateLimit-Reset: 1698156000    # Unix timestamp when limit resets
```

### Skip Development
Rate limiting is automatically skipped for localhost in development:

```javascript
skip: (req) => config.isDevelopment() && req.ip === '127.0.0.1'
```

### Logging
All rate limit violations are automatically logged:

```javascript
logger.warn('Rate limit exceeded', {
  ip: req.ip,
  path: req.path,
  method: req.method,
  requestId: req.id,
});
```

Check logs:
```bash
grep "Rate limit exceeded" logs/app-*.log
```

---

## Usage Examples

### Protecting a Route

```javascript
import { authLimiter } from '../middleware/rateLimiter.js';

// Apply to single route
router.post('/login', authLimiter, loginController);

// Apply to multiple routes
router.post('/login', authLimiter, loginController);
router.post('/reset-password', authLimiter, resetController);
```

### Multiple Rate Limiters

You can apply multiple limiters:

```javascript
// Both general (100/15min) and auth (5/hour) limits apply
router.post('/login', authLimiter, loginController);
```

The stricter limit will trigger first.

### Custom Rate Limiter

Create a custom limiter for specific needs:

```javascript
import { createCustomLimiter } from './middleware/rateLimiter.js';

const quoteLimiter = createCustomLimiter({
  name: 'quote-requests',
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 requests per hour
  message: {
    status: 'error',
    message: 'Too many quote requests, please try again later.'
  }
});

router.post('/quotes/request', quoteLimiter, createQuoteController);
```

---

## Rate Limit Configuration

### Current Limits

| Endpoint Type | Limit | Window | Skip Successful |
|--------------|-------|--------|-----------------|
| General API | 100 | 15 minutes | No |
| Authentication | 5 | 1 hour | Yes |
| Account Creation | 3 | 1 hour | No |
| File Upload | 10 | 1 hour | No |
| API Key | 1000 | 1 hour | No |

### Adjusting Limits

Edit `/middleware/rateLimiter.js`:

```javascript
export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Change from 5 to 10
  // ...
});
```

**Recommendations:**
- **More Lenient:** Increase `max` value
- **More Strict:** Decrease `max` value
- **Longer Window:** Increase `windowMs`
- **Shorter Window:** Decrease `windowMs`

---

## Testing Rate Limiting

### Test 1: General API Limit

**Make 101 requests quickly:**

```bash
for i in {1..101}; do
  curl -s http://localhost:5000/api/ -o /dev/null -w "%{http_code}\n"
done
```

**Expected:**
- First 100: Status `200`
- Request 101: Status `429` (Too Many Requests)

---

### Test 2: Auth Limit

**Try to login 6 times:**

```bash
for i in {1..6}; do
  curl -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}' \
    -w "\n%{http_code}\n"
  sleep 1
done
```

**Expected:**
- First 5: Status `401` (Invalid credentials)
- Request 6: Status `429` (Rate limit exceeded)

---

### Test 3: Account Creation Limit

**Try to create 4 accounts:**

```bash
for i in {1..4}; do
  curl -X POST http://localhost:5000/api/users/signup \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"User$i\",\"email\":\"user$i@test.com\",\"password\":\"Password123\"}" \
    -w "\n%{http_code}\n"
  sleep 1
done
```

**Expected:**
- First 3: Status `201` or `400` (created or validation error)
- Request 4: Status `429` (Rate limit exceeded)

---

### Test 4: Check Headers

```bash
curl -I http://localhost:5000/api/
```

**Expected response headers:**
```
HTTP/1.1 200 OK
RateLimit-Limit: 100
RateLimit-Remaining: 99
RateLimit-Reset: 1698156000
```

---

## Monitoring Rate Limits

### Check Logs

**View rate limit violations:**
```bash
# Today's violations
grep "Rate limit exceeded" logs/app-$(date +%Y-%m-%d).log

# Count violations by IP
grep "Rate limit exceeded" logs/app-*.log | jq -r '.ip' | sort | uniq -c | sort -rn

# Count violations by endpoint
grep "Rate limit exceeded" logs/app-*.log | jq -r '.path' | sort | uniq -c | sort -rn
```

### Find Abusive IPs

```bash
# IPs with most rate limit hits
cat logs/app-*.log | grep "Rate limit exceeded" | jq -r '.ip' | sort | uniq -c | sort -rn | head -10
```

### Track Over Time

```bash
# Rate limit hits per hour
cat logs/app-$(date +%Y-%m-%d).log | grep "Rate limit exceeded" | jq -r '.timestamp' | cut -d' ' -f2 | cut -d':' -f1 | sort | uniq -c
```

---

## Bypassing Rate Limits

### For Testing

**Option 1: Use different IPs**
```bash
# Using different source IPs (requires multiple network interfaces)
curl --interface eth0 http://localhost:5000/api/
curl --interface eth1 http://localhost:5000/api/
```

**Option 2: Wait for window to expire**
```bash
# Wait for time window to expire
sleep 900 # 15 minutes for general limiter
```

**Option 3: Run in development**
Rate limits are skipped for localhost `127.0.0.1` in development mode.

### For Legitimate Use Cases

**Option 1: API Keys**
Use API key limiter with higher limits (1000/hour).

**Option 2: IP Whitelist**
Add trusted IPs to skip list:

```javascript
export const generalLimiter = rateLimit({
  skip: (req) => {
    const trustedIPs = ['203.0.113.0', '198.51.100.0'];
    return trustedIPs.includes(req.ip);
  },
  // ...
});
```

**Option 3: Increase Limits**
Adjust limits for specific users/endpoints as needed.

---

## Distributed Systems

### Issue with Multiple Servers

By default, rate limits are stored in memory per server instance. If you have multiple servers:

```
User → Load Balancer → Server 1 (100 requests)
                     → Server 2 (100 requests)
Total: 200 requests allowed instead of 100
```

### Solution: Redis Store

For production with multiple servers, use Redis:

```bash
npm install rate-limit-redis redis
```

Update rate limiter:

```javascript
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

const redisClient = createClient({
  url: config.redis.url
});

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:',
  }),
});
```

This ensures rate limits work across all servers.

---

## Best Practices

### 1. Layer Rate Limits

Apply multiple layers:

```javascript
// Global limit: 100/15min
app.use('/api/', generalLimiter);

// Auth limit: 5/hour
router.post('/login', authLimiter, ...);
```

The stricter limit provides extra protection.

### 2. Use Appropriate Limits

```javascript
// ✅ Good - Reasonable limits
authLimiter: 5 per hour     // Prevents brute force
createAccount: 3 per hour   // Prevents spam

// ❌ Bad - Too lenient
authLimiter: 1000 per hour  // Doesn't prevent anything
```

### 3. Skip Successful Operations

```javascript
// ✅ Good - Only count failed login attempts
export const authLimiter = rateLimit({
  skipSuccessfulRequests: true,
  // ...
});

// ❌ Bad - Count all attempts (including successful)
export const authLimiter = rateLimit({
  skipSuccessfulRequests: false,
  // ...
});
```

### 4. Return Helpful Messages

```javascript
// ✅ Good - Clear message with guidance
message: 'Too many login attempts, please try again after an hour.'

// ❌ Bad - Vague message
message: 'Error'
```

### 5. Log All Violations

```javascript
// ✅ Good - Log for security monitoring
handler: (req, res) => {
  logger.warn('Rate limit exceeded', {
    ip: req.ip,
    path: req.path,
  });
  res.status(429).json({...});
}

// ❌ Bad - No logging
handler: (req, res) => {
  res.status(429).json({...});
}
```

### 6. Use Standard Headers

```javascript
// ✅ Good - Standard headers
standardHeaders: true,
legacyHeaders: false,

// ❌ Bad - Legacy headers
standardHeaders: false,
legacyHeaders: true,
```

### 7. Trust Proxy in Production

```javascript
// ✅ Good - Works behind load balancer
trustProxy: true,

// ❌ Bad - Uses proxy IP instead of client IP
trustProxy: false,
```

---

## Troubleshooting

### Rate Limit Not Working

**Check 1: Proxy configuration**
```javascript
// In index.js
app.set('trust proxy', 1);

// In rateLimiter.js
trustProxy: true,
```

**Check 2: Middleware order**
```javascript
// ✅ Correct order
app.use(requestId);
app.use('/api/', generalLimiter);
app.use('/api/auth', authRoutes);

// ❌ Wrong order - rate limiter after routes
app.use('/api/auth', authRoutes);
app.use('/api/', generalLimiter);
```

**Check 3: Route path matching**
```javascript
// ✅ Correct - matches all /api/ routes
app.use('/api/', generalLimiter);

// ❌ Wrong - only matches exact /api
app.use('/api', generalLimiter);
```

### Rate Limit Too Strict

**Symptom:** Legitimate users getting blocked

**Solution 1:** Increase limit
```javascript
max: 200, // Increased from 100
```

**Solution 2:** Increase window
```javascript
windowMs: 30 * 60 * 1000, // 30 minutes instead of 15
```

**Solution 3:** Whitelist IPs
```javascript
skip: (req) => trustedIPs.includes(req.ip),
```

### Rate Limit Too Lenient

**Symptom:** Attackers not being stopped

**Solution 1:** Decrease limit
```javascript
max: 3, // Decreased from 5
```

**Solution 2:** Decrease window
```javascript
windowMs: 30 * 60 * 1000, // 30 minutes instead of 1 hour
```

**Solution 3:** Add more specific limiters
```javascript
// Add endpoint-specific limiters
router.post('/expensive-operation', customStrictLimiter, handler);
```

### Rate Limit Blocking Development

**Symptom:** Can't test in development

**Solution:** Add skip for localhost
```javascript
skip: (req) => config.isDevelopment() && req.ip === '127.0.0.1',
```

Or temporarily increase limits in development:
```javascript
max: config.isDevelopment() ? 1000 : 100,
```

---

## Security Recommendations

### 1. Monitor Violations Daily

```bash
# Check for attacks
tail -50 logs/app-$(date +%Y-%m-%d).log | grep "Rate limit exceeded"
```

### 2. Alert on Spikes

Set up alerts for high rate limit violations:
- More than 100 violations per hour
- Same IP hitting limit repeatedly
- Violations on sensitive endpoints (auth, signup)

### 3. Block Persistent Offenders

If an IP repeatedly hits rate limits, consider blocking:

```javascript
const blockedIPs = new Set();

export const generalLimiter = rateLimit({
  skip: (req) => {
    if (blockedIPs.has(req.ip)) {
      return false; // Don't skip, always rate limit
    }
    return false;
  },
  handler: (req, res) => {
    // Track violations
    const key = `violations:${req.ip}`;
    const violations = cache.get(key) || 0;
    cache.set(key, violations + 1);

    // Block after 10 violations
    if (violations >= 10) {
      blockedIPs.add(req.ip);
      logger.error('IP blocked', { ip: req.ip });
    }

    // ... send response
  },
});
```

### 4. Layer with WAF

Combine rate limiting with Web Application Firewall:
- Cloudflare Rate Limiting
- AWS WAF
- Nginx rate limiting

### 5. Use CAPTCHA

For repeated violations, require CAPTCHA:
- After 3 failed login attempts
- Before allowing signup
- On sensitive operations

---

## Performance Considerations

### Memory Usage

Each rate limiter stores request counts in memory:
- ~100 bytes per IP
- With 1000 active IPs: ~100 KB
- Negligible impact

### Request Overhead

Rate limiting adds minimal overhead:
- ~0.1-0.5ms per request
- In-memory lookup
- No database queries

### Cleanup

Old entries are automatically cleaned up when window expires.

---

## Resources

- [express-rate-limit Documentation](https://github.com/express-rate-limit/express-rate-limit)
- [OWASP Rate Limiting](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html)
- [Redis Store](https://github.com/express-rate-limit/rate-limit-redis)

---

**Last Updated:** October 24, 2025
**Version:** 1.0
**Author:** TendorAI Backend Team
