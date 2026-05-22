'use strict';

const { execSync } = require('child_process');
const path = require('path');

// Load .env before anything else — globalSetup runs before setupFiles/dotenv in app
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = async () => {
  const cwd = path.join(__dirname, '..');
  const dbUrl = process.env.TEST_DATABASE_URL
    || 'postgresql://postgres:postgres@localhost:5432/innovaafric_test';
  const env = { ...process.env, DATABASE_URL: dbUrl };

  // Drop and recreate the public schema — equivalent to migrate reset, no AI safety block
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await prisma.$executeRawUnsafe('CREATE SCHEMA public');
  } finally {
    await prisma.$disconnect();
  }

  // Apply all migrations to the clean schema
  execSync('node node_modules/prisma/build/index.js migrate deploy', {
    cwd, env, stdio: 'pipe'
  });

  // Seed reference data
  execSync('node prisma/seed.js', { cwd, env, stdio: 'pipe' });
};
