// Test setup file
// Runs before each test suite
import { jest } from '@jest/globals';

// Set test environment
process.env.NODE_ENV = 'test';

// Increase test timeout for integration tests
jest.setTimeout(10000);

// Global test utilities
global.testUtils = {
  // Helper to create mock request
  mockRequest: (data = {}) => ({
    body: data.body || {},
    params: data.params || {},
    query: data.query || {},
    headers: data.headers || {},
    user: data.user || null,
    userId: data.userId || null,
    ip: data.ip || '127.0.0.1',
    ...data,
  }),

  // Helper to create mock response
  mockResponse: () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.sendStatus = jest.fn().mockReturnValue(res);
    res.set = jest.fn().mockReturnValue(res);
    return res;
  },

  // Helper to create mock next function
  mockNext: () => jest.fn(),
};
