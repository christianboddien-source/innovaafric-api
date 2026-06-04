-- ApiKey table
CREATE TABLE IF NOT EXISTS "ApiKey" (
    "id"          TEXT NOT NULL,
    "partnerName" TEXT NOT NULL,
    "keyPrefix"   TEXT NOT NULL,
    "fullKey"     TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'test',
    "permissions" TEXT NOT NULL DEFAULT 'read',
    "rateLimit"   INTEGER NOT NULL DEFAULT 1000,
    "callCount"   INTEGER NOT NULL DEFAULT 0,
    "status"      TEXT NOT NULL DEFAULT 'activa',
    "lastUsedAt"  TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_fullKey_key" ON "ApiKey"("fullKey");

-- Notification: ensure id has a default (handled by app), add body column if missing
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "body" TEXT NOT NULL DEFAULT '';

-- Product: make description, imageUrl, origin optional (drop NOT NULL if exists)
ALTER TABLE "Product" ALTER COLUMN "description" DROP NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "imageUrl" DROP NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "origin" DROP NOT NULL;

-- User: add blocked, blockedReason, city, department, scope if missing
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "blocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "blockedReason" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "department" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'user';

-- ApiClient: add active, createdAt, description if missing
ALTER TABLE "ApiClient" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ApiClient" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ApiClient" ADD COLUMN IF NOT EXISTS "description" TEXT;
