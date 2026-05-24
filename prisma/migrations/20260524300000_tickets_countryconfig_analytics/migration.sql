CREATE TABLE IF NOT EXISTS "SupportTicket" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT,
    "name"        TEXT NOT NULL,
    "email"       TEXT NOT NULL,
    "subject"     TEXT NOT NULL,
    "message"     TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'open',
    "priority"    TEXT NOT NULL DEFAULT 'medium',
    "category"    TEXT NOT NULL DEFAULT 'general',
    "response"    TEXT,
    "respondedAt" TIMESTAMP(3),
    "respondedBy" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CountryConfig" (
    "id"             TEXT NOT NULL,
    "country"        TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "active"         BOOLEAN NOT NULL DEFAULT true,
    "p2pEnabled"     BOOLEAN NOT NULL DEFAULT true,
    "loansEnabled"   BOOLEAN NOT NULL DEFAULT true,
    "groceryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "cardsEnabled"   BOOLEAN NOT NULL DEFAULT true,
    "repName"        TEXT,
    "repEmail"       TEXT,
    "repPhone"       TEXT,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CountryConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CountryConfig_country_key" ON "CountryConfig"("country");
