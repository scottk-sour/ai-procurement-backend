# TendorAI Environment Variables

## Required Variables

### MONGODB_URI
- **Purpose:** MongoDB connection string
- **Example:** `mongodb://localhost:27017/tendorai`
- **Production:** Use MongoDB Atlas connection string
- **Used in:** Database connection, all models
- **Required:** ✅ Yes

### JWT_SECRET
- **Purpose:** Secret key for signing JWT access tokens
- **Example:** Generate with `openssl rand -base64 32`
- **Production:** Use strong, random 32+ character string
- **Used in:** Authentication middleware, login/register
- **Required:** ✅ Yes
- **Security:** Never commit to Git

### OPENAI_API_KEY
- **Purpose:** OpenAI API key for AI features
- **Example:** `sk-...`
- **Production:** Use production OpenAI key with rate limits
- **Used in:** AI recommendation engine, document parsing
- **Required:** ✅ Yes
- **Security:** Never commit to Git

### PORT
- **Purpose:** Port for Express server
- **Example:** `5000`
- **Production:** Usually set by hosting platform (Render, Heroku, etc.)
- **Used in:** Server startup
- **Required:** ✅ Yes

### FRONTEND_URL
- **Purpose:** Frontend URL for CORS configuration
- **Example:** `http://localhost:3000`
- **Production:** `https://tendorai.com` or your production URL
- **Used in:** CORS middleware
- **Required:** ✅ Yes

## Optional Variables

### JWT_REFRESH_SECRET
- **Purpose:** Secret key for signing JWT refresh tokens
- **Example:** Generate with `openssl rand -base64 32`
- **Default:** None (will be added in Day 3)
- **Production:** Different from JWT_SECRET
- **Used in:** Token refresh functionality (Day 3)
- **Security:** Never commit to Git

### JWT_EXPIRES_IN
- **Purpose:** Access token expiration time
- **Example:** `15m` (15 minutes), `1h` (1 hour)
- **Default:** `15m`
- **Used in:** Token generation

### JWT_REFRESH_EXPIRES_IN
- **Purpose:** Refresh token expiration time
- **Example:** `7d` (7 days), `30d` (30 days)
- **Default:** `7d`
- **Used in:** Refresh token generation

### OPENAI_MODEL
- **Purpose:** OpenAI model to use
- **Example:** `gpt-4`, `gpt-3.5-turbo`, `gpt-4-turbo`
- **Default:** `gpt-4`
- **Used in:** AI service calls
- **Note:** gpt-4 is more accurate but more expensive

### OPENAI_TEMPERATURE
- **Purpose:** Controls randomness of AI responses (0-2)
- **Example:** `0.7`
- **Default:** `0.7`
- **Used in:** AI recommendation engine
- **Note:** Lower = more deterministic, Higher = more creative

### OPENAI_MAX_TOKENS
- **Purpose:** Maximum tokens in AI response
- **Example:** `2000`
- **Default:** `2000`
- **Used in:** AI service calls
- **Note:** Controls response length and cost

### EMAIL_SERVICE
- **Purpose:** Email service provider
- **Example:** `sendgrid`, `ses`, `mailgun`
- **Default:** `sendgrid`
- **Used in:** Email service configuration

### EMAIL_API_KEY
- **Purpose:** Email service API key
- **Example:** `SG.xxx` (SendGrid), AWS credentials (SES)
- **Used in:** Sending emails (quotes, notifications)
- **Required for:** Email functionality
- **Security:** Never commit to Git

### EMAIL_FROM
- **Purpose:** Default sender email address
- **Example:** `noreply@tendorai.com`
- **Default:** `noreply@tendorai.com`
- **Used in:** All outgoing emails

### EMAIL_FROM_NAME
- **Purpose:** Default sender name
- **Example:** `TendorAI`
- **Default:** `TendorAI`
- **Used in:** Email display name

### MAX_FILE_SIZE
- **Purpose:** Maximum file upload size in bytes
- **Example:** `10485760` (10MB), `52428800` (50MB)
- **Default:** `10485760` (10MB)
- **Used in:** File upload middleware

### UPLOAD_DIR
- **Purpose:** Directory for uploaded files
- **Example:** `./uploads`, `/var/data/uploads`
- **Default:** `./uploads`
- **Used in:** File storage configuration

### ALLOWED_FILE_TYPES
- **Purpose:** Comma-separated list of allowed file extensions
- **Example:** `pdf,csv,xlsx,xls,doc,docx`
- **Default:** `pdf,csv,xlsx`
- **Used in:** File upload validation

### RATE_LIMIT_WINDOW_MS
- **Purpose:** Rate limit time window in milliseconds
- **Example:** `900000` (15 minutes), `3600000` (1 hour)
- **Default:** `900000` (15 minutes)
- **Used in:** Rate limiting middleware

### RATE_LIMIT_MAX_REQUESTS
- **Purpose:** Max requests per window per IP
- **Example:** `100`, `500`, `1000`
- **Default:** `100`
- **Used in:** Rate limiting middleware
- **Note:** Adjust based on expected traffic

### BCRYPT_ROUNDS
- **Purpose:** BCrypt hashing rounds (cost factor)
- **Example:** `12`, `10`, `14`
- **Default:** `12`
- **Used in:** Password hashing
- **Note:** Higher = more secure but slower (10-14 recommended)

### SESSION_SECRET
- **Purpose:** Secret for session management
- **Example:** Generate with `openssl rand -base64 32`
- **Used in:** Session middleware (if using sessions)
- **Security:** Never commit to Git

### AWS_ACCESS_KEY_ID
- **Purpose:** AWS access key for S3 uploads
- **Example:** `AKIAIOSFODNN7EXAMPLE`
- **Used in:** S3 file storage (production file uploads)
- **Required for:** S3 integration
- **Security:** Never commit to Git

### AWS_SECRET_ACCESS_KEY
- **Purpose:** AWS secret key
- **Example:** `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`
- **Used in:** S3 authentication
- **Required for:** S3 integration
- **Security:** Never commit to Git

### AWS_REGION
- **Purpose:** AWS region for S3 bucket
- **Example:** `us-east-1`, `eu-west-1`, `ap-southeast-1`
- **Default:** `us-east-1`
- **Used in:** S3 configuration

### AWS_S3_BUCKET
- **Purpose:** S3 bucket name for file storage
- **Example:** `tendorai-uploads`, `tendorai-prod-files`
- **Used in:** S3 file uploads
- **Required for:** S3 integration

### SENTRY_DSN
- **Purpose:** Sentry error tracking DSN
- **Example:** `https://xxx@yyy.ingest.sentry.io/zzz`
- **Used in:** Error monitoring and tracking (Week 6)
- **Required for:** Sentry integration

### LOG_LEVEL
- **Purpose:** Logging verbosity level
- **Example:** `debug`, `info`, `warn`, `error`
- **Default:** `info`
- **Used in:** Winston logger configuration (Day 6)
- **Note:** Use `debug` in dev, `warn` or `error` in production

## Environment-Specific Configs

### Development (.env or .env.development)
```bash
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/tendorai
PORT=5000
FRONTEND_URL=http://localhost:3000
LOG_LEVEL=debug
JWT_SECRET=dev_secret_change_in_production
OPENAI_API_KEY=sk-your-dev-key
```

### Staging (.env.staging)
```bash
NODE_ENV=staging
MONGODB_URI=mongodb+srv://user:pass@cluster-staging.mongodb.net/tendorai
PORT=5000
FRONTEND_URL=https://staging.tendorai.com
LOG_LEVEL=info
JWT_SECRET=staging_secret_32_chars_minimum
OPENAI_API_KEY=sk-your-staging-key
SENTRY_DSN=https://...
```

### Production (.env.production)
```bash
NODE_ENV=production
MONGODB_URI=mongodb+srv://user:pass@cluster-prod.mongodb.net/tendorai
PORT=5000
FRONTEND_URL=https://tendorai.com
LOG_LEVEL=warn
JWT_SECRET=production_secret_strong_random_32_plus_chars
OPENAI_API_KEY=sk-your-production-key
SENTRY_DSN=https://...
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_S3_BUCKET=tendorai-prod-uploads
EMAIL_API_KEY=xxx
```

## Setup Instructions

### First Time Setup
1. **Copy example file:**
   ```bash
   cp .env.example .env
   ```

2. **Generate JWT secrets:**
   ```bash
   openssl rand -base64 32  # For JWT_SECRET
   openssl rand -base64 32  # For JWT_REFRESH_SECRET
   openssl rand -base64 32  # For SESSION_SECRET
   ```

3. **Fill in required variables:**
   - Add your MongoDB connection string
   - Add your OpenAI API key
   - Set your frontend URL
   - Paste generated secrets

4. **Optional: Configure email:**
   - Get SendGrid API key from https://sendgrid.com
   - Or configure AWS SES credentials

5. **Test configuration:**
   ```bash
   npm start
   # Should start without "Missing required environment variables" error
   ```

### Adding New Variables

1. **Add to .env.example** with description and placeholder
2. **Add to /config/env.js** in appropriate section
3. **Document in this file** (ENV_VARS.md)
4. **Update validation** in env.js if required
5. **Inform team** to update their .env files

## Security Best Practices

### Do's ✅
- ✅ **Use strong secrets** - minimum 32 characters, random
- ✅ **Different secrets per environment** - dev ≠ staging ≠ production
- ✅ **Rotate secrets quarterly** or after team member departure
- ✅ **Use secret managers in production** - AWS Secrets Manager, HashiCorp Vault
- ✅ **Limit access** to production secrets (only DevOps/leads)
- ✅ **Use .env.example** as template (no real values)
- ✅ **Validate on startup** - config/env.js checks required vars

### Don'ts ❌
- ❌ **Never commit .env to Git** (already in .gitignore)
- ❌ **Never share secrets in Slack/email** - use secure tools
- ❌ **Never reuse secrets** across environments
- ❌ **Never use weak secrets** - avoid "password123"
- ❌ **Never hardcode secrets** in source code
- ❌ **Never log secrets** - even in debug mode
- ❌ **Never commit .env.backup** with real values

## Troubleshooting

### Error: "Missing required environment variables"
**Cause:** Required var not set in .env
**Solution:**
```bash
# Check which vars are missing
npm start
# Copy .env.example if needed
cp .env.example .env
# Fill in missing values
```

### Error: "MongoServerSelectionError: connect ECONNREFUSED"
**Cause:** MongoDB not running or wrong connection string
**Solution:**
```bash
# Check MongoDB is running
mongosh --version
# Verify MONGODB_URI in .env
# For local: mongodb://localhost:27017/tendorai
# For Atlas: mongodb+srv://...
```

### Error: "OpenAI API request failed: 401"
**Cause:** Invalid OPENAI_API_KEY
**Solution:**
- Check key in .env matches OpenAI dashboard
- Ensure key starts with `sk-`
- Verify API key hasn't been revoked

### Server starts but can't connect from frontend
**Cause:** Wrong FRONTEND_URL in CORS config
**Solution:**
- Ensure FRONTEND_URL matches actual frontend URL
- Check CORS logs in backend console
- Verify frontend is making requests to correct PORT

## Environment Variable Reference Card

| Variable | Required | Default | Example |
|----------|----------|---------|---------|
| MONGODB_URI | ✅ | - | `mongodb://localhost:27017/tendorai` |
| JWT_SECRET | ✅ | - | `[32+ char random string]` |
| OPENAI_API_KEY | ✅ | - | `sk-...` |
| PORT | ✅ | - | `5000` |
| FRONTEND_URL | ✅ | - | `http://localhost:3000` |
| JWT_EXPIRES_IN | ❌ | `15m` | `15m`, `1h` |
| OPENAI_MODEL | ❌ | `gpt-4` | `gpt-4`, `gpt-3.5-turbo` |
| EMAIL_API_KEY | ❌ | - | `SG.xxx` |
| MAX_FILE_SIZE | ❌ | `10485760` | `10485760` (10MB) |
| RATE_LIMIT_MAX | ❌ | `100` | `100`, `500` |
| LOG_LEVEL | ❌ | `info` | `debug`, `info`, `warn` |

## Next Steps

- **Day 2:** ✅ Environment configuration complete
- **Day 3:** Add JWT_REFRESH_SECRET and implement refresh tokens
- **Week 4:** Add email service configuration
- **Week 6:** Add Sentry DSN for error monitoring
- **Week 7:** Configure AWS S3 for production file uploads

---

*Last updated: Day 2.1 - Environment Configuration*
