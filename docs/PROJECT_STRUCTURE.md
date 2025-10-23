# TendorAI Backend Project Structure

## Directory Organization

### Core Application

#### /controllers
**Purpose:** Business logic for handling HTTP requests

**Examples:**
- `userController.js` - User registration, login, profile
- `vendorController.js` - Vendor management
- `quoteController.js` - Quote generation and retrieval
- `aiController.js` - AI matching and recommendations

**When to add:** Creating new API endpoint functionality

#### /models
**Purpose:** MongoDB/Mongoose database schemas

**Examples:**
- `User.js` - User account data
- `Vendor.js` - Vendor information
- `Quote.js` - Quote requests and responses
- `VendorProduct.js` - Product catalog

**When to add:** Creating new database collections

#### /routes
**Purpose:** Express route definitions and endpoint mappings

**Examples:**
- `authRoutes.js` - Authentication endpoints
- `quoteRoutes.js` - Quote-related endpoints
- `vendorRoutes.js` - Vendor management endpoints

**When to add:** Exposing new API endpoints

#### /middleware
**Purpose:** Request/response processing functions

**Examples:**
- `authMiddleware.js` - JWT authentication
- `errorHandler.js` - Centralized error handling
- `validateQuoteRequest.js` - Input validation

**When to add:** Reusable request validation or processing logic

#### /services
**Purpose:** Complex reusable business logic

**Examples:**
- `aiRecommendationEngine.js` - AI vendor matching
- `FileParserService.js` - Document parsing
- `notificationService.js` - Email/notification handling

**When to add:** Business logic used across multiple controllers

#### /utils
**Purpose:** Small helper functions and utilities

**Examples:** Date formatting, string manipulation, validation helpers

**When to add:** Simple, stateless utility functions

### Data & Assets

#### /data
**Purpose:** Static data files and import data

**Subfolders:**
- `/pricing-tables` - Vendor pricing CSV files (Canon, Ricoh, Konica Minolta, Sharp, Xerox)
- `/imports` - Data ready for import
- `/samples` - Sample data for testing

**When to add:** New vendor data files or test datasets

### Scripts & Automation

#### /scripts
**Purpose:** Maintenance and utility scripts

**Subfolders:**
- `/imports` - Data import and seeding scripts (importRicohMachines.js, seedVendors.js)
- `/database` - Database maintenance
- `/maintenance` - Cleanup and utility scripts (clearUploads.js, restoreNew4.js)

**When to add:** New automation or maintenance tasks

### Testing

#### /tests
**Purpose:** All test files

**Subfolders:**
- `/unit` - Unit tests for functions/services
- `/integration` - API endpoint tests
- `/e2e` - End-to-end user flow tests

**When to add:** Tests for new features (configured in Week 3)

### Configuration & Documentation

#### /config
**Purpose:** Configuration files

**Examples:** Database config, environment validation (will be added in Day 2)

#### /docs
**Purpose:** Project documentation

**Examples:** Architecture docs, API docs, setup guides

## File Naming Conventions

- **Controllers:** `camelCaseController.js` (e.g., `userController.js`)
- **Models:** `PascalCase.js` (e.g., `User.js`, `QuoteRequest.js`)
- **Routes:** `camelCaseRoutes.js` (e.g., `authRoutes.js`)
- **Services:** `camelCaseService.js` (e.g., `emailService.js`)
- **Middleware:** `camelCase.js` or `camelCaseMiddleware.js`
- **Tests:** `[filename].test.js` (e.g., `userController.test.js`)
- **Utils:** `camelCase.js` (e.g., `formatDate.js`)

## Import Path Conventions

- **Relative imports** for files in same module
- **Absolute imports** for cross-module dependencies
- **From scripts:** Use relative paths (e.g., `../../models/Vendor.js`)
- Example: `import User from '../models/User.js'`

## Adding New Features

### New API Endpoint
1. Create model in `/models` if needed
2. Create controller function in `/controllers`
3. Create route in `/routes`
4. Add middleware for validation/auth
5. Write tests in `/tests/integration`

### New Service
1. Create service file in `/services`
2. Export service functions
3. Import in controllers that need it
4. Write unit tests in `/tests/unit`

### New Data Import
1. Add CSV/data file to `/data/imports` or `/data/pricing-tables`
2. Create import script in `/scripts/imports`
3. Update CSV path to point to new location (e.g., `../../data/pricing-tables/filename.csv`)
4. Test with sample data first
5. Document usage in script comments

## Directory Tree

```
ai-procurement-backend/
├── config/              # Configuration files (Day 2)
├── controllers/         # Request handlers
├── data/
│   ├── pricing-tables/  # Vendor pricing CSVs
│   ├── imports/         # Data for importing
│   └── samples/         # Sample/test data
├── docs/                # Documentation
│   ├── PROJECT_STRUCTURE.md
│   └── structure.txt    # Legacy structure reference
├── middleware/          # Express middleware
├── models/              # Mongoose schemas
├── routes/              # API routes
├── scripts/
│   ├── imports/         # Data import scripts
│   ├── database/        # DB maintenance (future)
│   └── maintenance/     # Utility scripts
├── services/            # Business logic services
├── tests/
│   ├── unit/            # Unit tests (Week 3)
│   ├── integration/     # Integration tests (Week 3)
│   └── e2e/             # E2E tests (Week 3)
├── uploads/             # User file uploads (gitignored)
├── utils/               # Helper functions
├── .env                 # Environment variables (gitignored)
├── .env.example         # Environment template (Day 2)
├── .gitignore
├── index.js             # Application entry point
├── package.json
└── README.md

```

## Notes

- All CSV files in `/data/pricing-tables/` are gitignored (see .gitignore)
- Only sample CSVs in `/data/samples/` should be committed
- Import scripts in `/scripts/imports/` need relative paths to data files
- Uploads directory is preserved via `.gitkeep` but contents are ignored
- Project uses ES Modules (`type: "module"` in package.json)

## Recent Changes (Day 1 Cleanup)

- ✅ Moved all CSV files to `/data/pricing-tables/`
- ✅ Moved test files to `/tests/unit/`
- ✅ Moved import scripts to `/scripts/imports/`
- ✅ Moved maintenance scripts to `/scripts/maintenance/`
- ✅ Moved documentation to `/docs/`
- ✅ Updated import paths in moved scripts
- ✅ Enhanced .gitignore for better file management
- ✅ Added .gitkeep files to preserve empty directories
- ✅ Added test/lint/format scripts to package.json (configured in Week 3)

## Next Steps

- Day 2: Add `/config/env.js` for environment validation
- Day 2: Implement centralized error handling
- Week 3: Configure Jest for testing
- Week 3: Add ESLint and Prettier for code quality
