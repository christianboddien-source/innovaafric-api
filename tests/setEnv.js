'use strict';

// Must run before any module loads so Prisma picks up the test DB URL
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  || 'postgresql://postgres:postgres@localhost:5432/innovaafric_test';
process.env.NODE_ENV = 'test';
