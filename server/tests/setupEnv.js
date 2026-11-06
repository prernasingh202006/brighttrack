// Runs before any module is loaded: gives config/env.js a valid test environment.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-123456';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.MONGODB_URI = 'mongodb://placeholder/overridden-by-memory-server';
