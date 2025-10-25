export default {
  // Use Node environment for testing
  testEnvironment: 'node',

  // Transform ES modules
  transform: {},

  // Module name mapper for absolute imports
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },

  // Test match patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js',
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'middleware/**/*.js',
    'routes/**/*.js',
    'services/**/*.js',
    'controllers/**/*.js',
    'models/**/*.js',
    'config/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/coverage/**',
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },

  // Coverage directory
  coverageDirectory: 'coverage',

  // Coverage reporters
  coverageReporters: ['text', 'lcov', 'html'],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Test timeout
  testTimeout: 10000,

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks between tests
  restoreMocks: true,

  // Reset mocks between tests
  resetMocks: true,
};
