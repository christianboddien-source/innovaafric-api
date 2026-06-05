-- CreateTable: PhysicalCard
CREATE TABLE "PhysicalCard" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT,
    "userName"    TEXT NOT NULL,
    "userEmail"   TEXT NOT NULL,
    "country"     TEXT NOT NULL,
    "network"     TEXT NOT NULL DEFAULT 'Visa',
    "last4"       TEXT,
    "status"      TEXT NOT NULL DEFAULT 'pendiente',
    "limitAmount" DOUBLE PRECISION NOT NULL DEFAULT 100000,
    "currency"    TEXT NOT NULL DEFAULT 'XAF',
    "notes"       TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedAt"    TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhysicalCard_pkey" PRIMARY KEY ("id")
);

-- Enable RLS (consistent with migration 20260604120000)
ALTER TABLE "PhysicalCard" ENABLE ROW LEVEL SECURITY;
