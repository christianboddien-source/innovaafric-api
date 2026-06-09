-- AlterTable User: nuevos campos para login seguro
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

-- CreateTable Circular
CREATE TABLE IF NOT EXISTS "Circular" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "neighborhood" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "authorizedBy" TEXT,
    "authorizedByType" TEXT,
    "repId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Circular_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Circular_userId_key" ON "Circular"("userId");

-- CreateTable CircularAccount
CREATE TABLE IF NOT EXISTS "CircularAccount" (
    "id" TEXT NOT NULL,
    "circularId" TEXT NOT NULL,
    "unitBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalUnitsBought" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalUnitsUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalSaved" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "alertThreshold" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CircularAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CircularAccount_circularId_key" ON "CircularAccount"("circularId");

-- CreateTable CircularPurchase
CREATE TABLE IF NOT EXISTS "CircularPurchase" (
    "id" TEXT NOT NULL,
    "circularId" TEXT NOT NULL,
    "unitsRequested" DOUBLE PRECISION NOT NULL,
    "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "amountToPay" DOUBLE PRECISION NOT NULL,
    "amountSaved" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XAF',
    "bankName" TEXT,
    "bankRef" TEXT,
    "receiptUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CircularPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable CircularTopUp
CREATE TABLE IF NOT EXISTS "CircularTopUp" (
    "id" TEXT NOT NULL,
    "circularId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT,
    "clientPhone" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XAF',
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CircularTopUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable UnlockRequest
CREATE TABLE IF NOT EXISTS "UnlockRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "fullName" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UnlockRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey CircularAccount → Circular
ALTER TABLE "CircularAccount" DROP CONSTRAINT IF EXISTS "CircularAccount_circularId_fkey";
ALTER TABLE "CircularAccount" ADD CONSTRAINT "CircularAccount_circularId_fkey"
    FOREIGN KEY ("circularId") REFERENCES "Circular"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey CircularPurchase → Circular
ALTER TABLE "CircularPurchase" DROP CONSTRAINT IF EXISTS "CircularPurchase_circularId_fkey";
ALTER TABLE "CircularPurchase" ADD CONSTRAINT "CircularPurchase_circularId_fkey"
    FOREIGN KEY ("circularId") REFERENCES "Circular"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey CircularTopUp → Circular
ALTER TABLE "CircularTopUp" DROP CONSTRAINT IF EXISTS "CircularTopUp_circularId_fkey";
ALTER TABLE "CircularTopUp" ADD CONSTRAINT "CircularTopUp_circularId_fkey"
    FOREIGN KEY ("circularId") REFERENCES "Circular"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
