-- Add blocked fields to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "blocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "blockedReason" TEXT;

-- Expand ApiClient
ALTER TABLE "ApiClient" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ApiClient" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "ApiClient" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Create Campaign table
CREATE TABLE IF NOT EXISTS "Campaign" (
    "id"          TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "type"        TEXT NOT NULL DEFAULT 'promo',
    "status"      TEXT NOT NULL DEFAULT 'draft',
    "target"      TEXT NOT NULL DEFAULT 'all',
    "discount"    DOUBLE PRECISION,
    "code"        TEXT,
    "startDate"   TIMESTAMP(3),
    "endDate"     TIMESTAMP(3),
    "createdBy"   TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Campaign_code_key" ON "Campaign"("code");
