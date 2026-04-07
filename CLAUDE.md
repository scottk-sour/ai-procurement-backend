# CLAUDE.md — AI Procurement Backend (TendorAI)

## Project Overview

Node.js/Express backend for an AI-powered procurement platform that matches buyers with vendors. Integrates multiple AI platforms (OpenAI, Anthropic, Gemini, Groq) for intelligent vendor recommendations, manages vendor profiles, quotes, analytics, campaigns, and email outreach.

## Tech Stack

- **Runtime:** Node.js 22.x, ES Modules (`"type": "module"`)
- **Framework:** Express.js 4.x
- **Database:** MongoDB with Mongoose 8.x ODM
- **AI:** OpenAI, Anthropic Claude, Google Gemini, Groq
- **Auth:** JWT (bcrypt for passwords, role-based: user/vendor/admin)
- **Email:** Resend API (primary), Nodemailer (fallback)
- **Payments:** Stripe with webhooks
- **Logging:** Winston with daily log rotation
- **Validation:** express-validator + Zod
- **Security:** Helmet, rate limiting, mongo-sanitize, xss-clean

## Quick Start

```bash
npm install
cp .env.example .env       # Fill in required vars
npm run dev                 # Development with nodemon (port 5000)
npm start                   # Production start
```

### Required Environment Variables

`MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `OPENAI_API_KEY`, `PORT`, `FRONTEND_URL`, `ADMIN_JWT_SECRET`

See `.env.example` and `docs/ENV_VARS.md` for the full list.

## Project Structure

```
index.js              # Entry point — Express app setup, middleware, route mounting, DB connection
config/env.js         # Centralized env var validation and config object
controllers/          # Request handlers (thin — delegate to services)
routes/               # 32 route files, all mounted under /api/
models/               # 30+ Mongoose schemas (PascalCase filenames)
services/             # Core business logic (AI engine, email, reports, JWT)
middleware/           # Auth (user/vendor/admin), validation, error handling, uploads
utils/                # Helpers: AppError, catchAsync, distance, NLU parsing, CSV/Excel readers
validators/           # Input validation schemas
jobs/                 # Scheduled cron jobs (controlled by ENABLE_CRON env var)
scripts/              # One-off maintenance, import, and batch scripts
data/                 # Static data, pricing tables, sample files
docs/                 # 11 internal documentation files
mcp/                  # Model Context Protocol server package
mcp-server.js         # MCP server entry point
tests/                # Test suite (vitest — skeleton only, not yet configured)
public/               # Static assets
```

## Key Patterns

### File Naming

- Controllers: `camelCaseController.js`
- Models: `PascalCase.js`
- Routes: `camelCaseRoutes.js`
- Services: `camelCaseService.js`
- Middleware: `camelCase.js`
- Tests: `*.test.js`

### Error Handling

- Custom `AppError` class (`utils/AppError.js`) — throw with status code and message
- `catchAsync` wrapper (`utils/catchAsync.js`) — wrap all async route handlers
- Centralized error handler in `middleware/errorHandler.js`
- Dev mode returns full error details; production returns generic messages

### Auth Middleware

Three separate auth middlewares: `middleware/userAuth.js`, `middleware/vendorAuth.js`, `middleware/adminAuth.js`. JWT tokens extracted from `Authorization: Bearer <token>` or `x-auth-token` header. Tokens expire in 15 minutes with 7-day refresh tokens.

### API Routes

All routes are mounted under `/api/` in `index.js`. Common prefixes:
- `/api/auth` — registration, login, token refresh
- `/api/quotes` — quote management
- `/api/ai` — AI recommendations
- `/api/vendors` — vendor CRUD
- `/api/admin` — admin operations
- `/api/stripe` — payment webhooks (note: raw body parsing before JSON middleware)
- `/api/public` — unauthenticated endpoints

### Middleware Stack Order

Helmet > Rate limiting > CORS > Mongo sanitize > XSS clean > Request ID > Body parsing > Morgan logging > Routes > 404 handler > Error handler

### Service Layer

Heavy business logic lives in `services/`, not controllers. Key files:
- `aiRecommendationEngine.js` — core AI matching logic
- `aiEngineAdapter.js` — abstracts across AI platforms
- `aeoReportGenerator.js` — PDF report generation
- `emailService.js` — email sending via Resend
- `emailTemplates.js` — HTML email templates
- `jwtService.js` — token creation and validation
- `logger.js` — Winston logging configuration

## Testing

Vitest is installed but test scripts are placeholder stubs. Test directory structure:
- `tests/unit/` — unit tests
- Sample: `tests/unit/quoteAcceptance.test.js`

```bash
# Not yet configured — scripts echo placeholder messages
npm test
npm run test:unit
npm run test:coverage
```

## Linting / Formatting

Not yet configured. No ESLint or Prettier config files exist. Lint/format scripts are stubs.

## Common Scripts

```bash
npm run scan:mentions        # Run weekly AI mention scan
npm run email:weekly         # Send weekly vendor emails
npm run generate:reports     # Generate batch reports
npm run clean                # Remove node_modules and reinstall
```

## Important Notes

- The main `index.js` is ~72KB — it contains the full Express app setup, all route mounting, middleware config, DB connection, migrations, and graceful shutdown. Be careful with edits.
- Stripe webhook route requires raw body parsing — it's registered before the JSON body parser in `index.js`.
- CORS whitelist includes: tendorai.com, app.tendorai.com, localhost:3000, plus Render and Vercel deploy URLs.
- MongoDB connection uses pooling (10-50 connections, 5s timeout).
- Scheduled jobs only run when `ENABLE_CRON=true`.
- All imports use ES Module syntax with `.js` extensions in import paths.
- Env validation in `config/env.js` exits the process if required vars are missing.
