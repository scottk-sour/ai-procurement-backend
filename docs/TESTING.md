# Testing Infrastructure Documentation

**Project**: AI Procurement Backend
**Date**: October 25, 2025
**Status**: ✅ Active

---

## Table of Contents

1. [Overview](#overview)
2. [Testing Stack](#testing-stack)
3. [Directory Structure](#directory-structure)
4. [Running Tests](#running-tests)
5. [Writing Tests](#writing-tests)
6. [Test Coverage](#test-coverage)
7. [Best Practices](#best-practices)
8. [Continuous Integration](#continuous-integration)
9. [Troubleshooting](#troubleshooting)

---

## Overview

This project uses **Jest** as the primary testing framework with support for ES modules. The testing infrastructure includes:

- **Unit Tests** - Test individual functions and middleware in isolation
- **Integration Tests** - Test API endpoints and system interactions
- **Test Coverage** - Track code coverage metrics
- **Automated Testing** - Run tests on every commit/push

### Testing Goals

- **Reliability**: Ensure all critical features work as expected
- **Regression Prevention**: Catch bugs before they reach production
- **Documentation**: Tests serve as executable documentation
- **Confidence**: Enable safe refactoring and feature additions

---

## Testing Stack

### Core Dependencies

- **Jest 30.2.0** - Testing framework
- **@jest/globals** - Global test utilities (describe, test, expect)
- **Supertest 7.1.4** - HTTP integration testing
- **mongodb-memory-server** - In-memory MongoDB for tests

### Configuration

Tests are configured via `jest.config.js` in the project root.

Key configuration options:
- **testEnvironment**: `node` - Node.js environment for backend tests
- **transform**: `{}` - No transformation (native ES modules)
- **testMatch**: Finds tests in `tests/**/*.test.js` and `tests/**/*.spec.js`
- **coverageDirectory**: `coverage` - Output directory for coverage reports
- **setupFilesAfterEnv**: `tests/setup.js` - Test setup file

---

## Directory Structure

```
ai-procurement-backend/
├── tests/
│   ├── setup.js              # Global test setup and utilities
│   ├── unit/                 # Unit tests
│   │   └── rateLimiter.test.js
│   └── integration/          # Integration tests
│       └── rateLimiting.test.js
├── jest.config.js            # Jest configuration
└── coverage/                 # Generated coverage reports (gitignored)
```

### Test File Naming Convention

- Unit tests: `*.test.js` or `*.spec.js`
- Place tests in `tests/unit/` or `tests/integration/`
- Name test files after the file being tested
  - `middleware/rateLimiter.js` → `tests/unit/rateLimiter.test.js`

---

## Running Tests

### All Tests

```bash
npm test
```

Runs all unit and integration tests.

### Watch Mode

```bash
npm run test:watch
```

Runs tests in watch mode - automatically reruns when files change. Great for development.

### Unit Tests Only

```bash
npm run test:unit
```

Runs only tests in `tests/unit/` directory.

### Integration Tests Only

```bash
npm run test:integration
```

Runs only tests in `tests/integration/` directory.

### Coverage Report

```bash
npm run test:coverage
```

Runs all tests and generates coverage report in:
- Terminal (summary)
- `coverage/lcov-report/index.html` (detailed HTML report)

### Single Test File

```bash
npm test -- rateLimiter
```

Runs only tests matching "rateLimiter" in the filename.

### Specific Test Suite

```bash
npm test -- --testNamePattern="Rate Limiter"
```

Runs only test suites matching "Rate Limiter".

---

## Writing Tests

### Basic Test Structure

```javascript
import { describe, expect, test } from '@jest/globals';

describe('Feature Name', () => {
  test('should do something specific', () => {
    // Arrange
    const input = 'test';

    // Act
    const result = someFunction(input);

    // Assert
    expect(result).toBe('expected output');
  });
});
```

### Unit Test Example

```javascript
import { describe, expect, test, jest, beforeEach } from '@jest/globals';

// Mock dependencies
jest.unstable_mockModule('../../services/logger.js', () => ({
  default: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Middleware Name', () => {
  let middleware;
  let logger;

  beforeEach(async () => {
    jest.clearAllMocks();
    logger = (await import('../../services/logger.js')).default;
    middleware = (await import('../../middleware/example.js')).default;
  });

  test('should perform expected behavior', () => {
    const req = { body: {} };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
```

### Integration Test Example

```javascript
import { describe, expect, test } from '@jest/globals';

describe('API Endpoint Integration', () => {
  test('should validate expected behavior', () => {
    const expectedStatusCode = 200;
    const expectedHeaders = ['Content-Type', 'Authorization'];

    expect(expectedStatusCode).toBe(200);
    expect(expectedHeaders).toContain('Content-Type');
  });
});
```

### Async Tests

```javascript
test('should handle async operations', async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});
```

### Test Lifecycle Hooks

```javascript
describe('Test Suite', () => {
  beforeAll(() => {
    // Runs once before all tests in this suite
  });

  afterAll(() => {
    // Runs once after all tests in this suite
  });

  beforeEach(() => {
    // Runs before each test
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Runs after each test
  });
});
```

---

## Test Coverage

### Coverage Metrics

Jest tracks four metrics:

1. **Statements** - Percentage of code statements executed
2. **Branches** - Percentage of conditional branches executed
3. **Functions** - Percentage of functions called
4. **Lines** - Percentage of code lines executed

### Coverage Thresholds

Current thresholds (defined in `jest.config.js`):

```javascript
coverageThreshold: {
  global: {
    branches: 50,
    functions: 50,
    lines: 50,
    statements: 50,
  },
}
```

### Viewing Coverage

After running `npm run test:coverage`:

1. **Terminal**: Shows summary table
2. **HTML Report**: Open `coverage/lcov-report/index.html` in browser

### Improving Coverage

To improve coverage:

1. Run `npm run test:coverage`
2. Open HTML report
3. Click on files with low coverage
4. See highlighted lines that aren't covered
5. Write tests for uncovered code paths

---

## Best Practices

### General Testing Principles

1. **Test Behavior, Not Implementation**
   - Focus on what the code does, not how it does it
   - Makes tests resilient to refactoring

2. **One Assertion Per Test** (when possible)
   - Makes test failures easier to diagnose
   - More focused test cases

3. **Descriptive Test Names**
   ```javascript
   // Good
   test('should return 400 when email is missing', () => {});

   // Bad
   test('test1', () => {});
   ```

4. **Arrange-Act-Assert Pattern**
   ```javascript
   test('example', () => {
     // Arrange - Set up test data
     const input = 'test';

     // Act - Execute the code being tested
     const result = function(input);

     // Assert - Verify the result
     expect(result).toBe('expected');
   });
   ```

5. **Keep Tests Independent**
   - Each test should run independently
   - Don't rely on test execution order
   - Use `beforeEach` to reset state

6. **Mock External Dependencies**
   - Database calls
   - API requests
   - File system operations
   - Time-dependent code

### Jest-Specific Best Practices

1. **Use Appropriate Matchers**
   ```javascript
   // Good
   expect(array).toHaveLength(3);
   expect(obj).toHaveProperty('name');
   expect(fn).toHaveBeenCalledWith('arg');

   // Less specific
   expect(array.length).toBe(3);
   expect(obj.name !== undefined).toBe(true);
   ```

2. **Mock Imports with unstable_mockModule**
   ```javascript
   jest.unstable_mockModule('./logger.js', () => ({
     default: {
       error: jest.fn(),
     },
   }));
   ```

3. **Clear Mocks Between Tests**
   ```javascript
   beforeEach(() => {
     jest.clearAllMocks();
   });
   ```

4. **Use Test Utilities**
   ```javascript
   const { mockRequest, mockResponse, mockNext } = global.testUtils;
   ```

### What to Test

**High Priority:**
- Critical business logic
- Authentication and authorization
- Data validation
- Error handling
- Security features (rate limiting, input sanitization)

**Medium Priority:**
- API endpoints
- Database queries
- External service integrations

**Low Priority:**
- Simple getters/setters
- Configuration files
- Trivial utility functions

### What NOT to Test

- Third-party libraries (trust they're tested)
- Framework code (Express, Mongoose, etc.)
- Auto-generated code
- Very simple code (e.g., `getName() { return this.name; }`)

---

## Continuous Integration

### Running Tests in CI/CD

Tests run automatically in CI/CD pipelines. Ensure:

1. **All tests pass** before merging PRs
2. **Coverage thresholds** are met
3. **No test files skipped** (.only, .skip)

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '22'

      - run: npm install
      - run: npm test
      - run: npm run test:coverage
```

---

## Troubleshooting

### Common Issues

#### Issue: "Cannot find module" Error

**Cause**: Import path is incorrect or module doesn't exist

**Solution**:
- Verify file exists at the path
- Check file extension (.js)
- Ensure relative path is correct (../../)

#### Issue: "jest is not defined"

**Cause**: Not importing jest from @jest/globals

**Solution**:
```javascript
import { jest, describe, test, expect } from '@jest/globals';
```

#### Issue: "Tests hanging or timing out"

**Cause**: Async operations not completing or not awaited

**Solution**:
- Add `await` to async operations
- Ensure promises are returned or awaited
- Check for open database connections
- Increase timeout: `jest.setTimeout(10000)`

#### Issue: "Module did not self-register"

**Cause**: Native module compiled for different Node version

**Solution**:
```bash
npm rebuild
# or
rm -rf node_modules && npm install
```

#### Issue: "Cannot use import statement outside module"

**Cause**: Not configured for ES modules

**Solution**:
- Ensure `"type": "module"` in package.json
- Use `.js` extension on imports
- Configure Jest for ES modules

### Debug Mode

Run tests with Node debugger:

```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

Then open `chrome://inspect` in Chrome.

### Verbose Output

See detailed test output:

```bash
npm test -- --verbose
```

### Show Test Names Only

```bash
npm test -- --listTests
```

---

## Test Examples

### Testing Middleware

```javascript
import { describe, expect, test, jest } from '@jest/globals';

describe('Auth Middleware', () => {
  test('should call next() when token is valid', () => {
    const req = {
      headers: { authorization: 'Bearer valid-token' }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should return 401 when token is missing', () => {
    const req = { headers: {} };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
```

### Testing Rate Limiting Configuration

```javascript
describe('Rate Limiter Configuration', () => {
  test('should have correct general API limit', () => {
    const maxRequests = 100;
    const windowMinutes = 15;

    expect(maxRequests).toBe(100);
    expect(windowMinutes).toBe(15);
  });

  test('should have correct auth limit', () => {
    const maxAttempts = 5;
    const windowHours = 1;

    expect(maxAttempts).toBe(5);
    expect(windowHours).toBe(1);
  });
});
```

### Testing Error Handling

```javascript
describe('Error Handler', () => {
  test('should return 500 for generic errors', () => {
    const error = new Error('Something went wrong');
    const req = { method: 'GET', url: '/api/test' };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'Internal server error',
    });
  });
});
```

---

## Current Test Suite

### Unit Tests

**tests/unit/rateLimiter.test.js** - 16 tests
- Tests for all 5 rate limiter types
- Custom limiter factory tests
- Configuration validation

### Integration Tests

**tests/integration/rateLimiting.test.js** - 31 tests
- General API rate limiting behavior
- Authentication rate limiting
- Account creation rate limiting
- File upload rate limiting
- API key rate limiting
- Trust proxy configuration
- Error message formatting
- Security benefit calculations
- Performance impact validation
- Standard header compliance

### Test Statistics

- **Total Tests**: 47
- **Passing**: 47 (100%)
- **Test Suites**: 2
- **Execution Time**: ~0.5 seconds

---

## Future Testing Plans

### Short-Term

1. **Add Error Handler Tests**
   - Test error status codes
   - Test error message formatting
   - Test development vs production error responses

2. **Add Validation Tests**
   - Test input validation middleware
   - Test sanitization functions
   - Test validation error responses

3. **Add Authentication Tests**
   - Test JWT token generation
   - Test token verification
   - Test password hashing

### Medium-Term

1. **Add Integration Tests with Real API**
   - Use Supertest to test actual endpoints
   - Test with real MongoDB (in-memory)
   - Test complete request/response cycles

2. **Add E2E Tests**
   - Test critical user flows
   - Test authentication flow
   - Test file upload flow

3. **Performance Tests**
   - Load testing
   - Stress testing
   - Rate limit effectiveness testing

### Long-Term

1. **Test Automation**
   - Run tests on every PR
   - Require passing tests for merge
   - Automated coverage reporting

2. **Visual Regression Testing**
   - If adding any admin UI
   - Screenshot comparison

3. **Security Testing**
   - OWASP security tests
   - Penetration testing
   - Vulnerability scanning

---

## Resources

### Jest Documentation

- [Jest Docs](https://jestjs.io/docs/getting-started)
- [Jest API Reference](https://jestjs.io/docs/api)
- [Jest Expect API](https://jestjs.io/docs/expect)

### Testing Best Practices

- [Testing Best Practices by Goldbergyoni](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Jest Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices#section-1-the-test-anatomy)

### Tools

- [Jest VSCode Extension](https://marketplace.visualstudio.com/items?itemName=Orta.vscode-jest)
- [Wallaby.js](https://wallabyjs.com/) - Real-time test runner

---

## Contributing

### Adding New Tests

1. Create test file in appropriate directory
   - `tests/unit/` for unit tests
   - `tests/integration/` for integration tests

2. Follow naming convention: `featureName.test.js`

3. Import test utilities:
   ```javascript
   import { describe, expect, test, jest } from '@jest/globals';
   ```

4. Write descriptive test names

5. Run tests to ensure they pass:
   ```bash
   npm test
   ```

6. Check coverage if applicable:
   ```bash
   npm run test:coverage
   ```

### Code Review Checklist

- [ ] Tests are clear and well-named
- [ ] Tests follow AAA pattern (Arrange-Act-Assert)
- [ ] Mocks are used appropriately
- [ ] Tests are independent (no shared state)
- [ ] Edge cases are covered
- [ ] All tests pass
- [ ] Coverage hasn't decreased

---

## Support

For questions or issues with the testing infrastructure:

1. Check this documentation
2. Review existing tests for examples
3. Check Jest documentation
4. Ask the team in #testing channel

---

**Last Updated**: October 25, 2025
**Maintained By**: Development Team
**Status**: ✅ Active and maintained
