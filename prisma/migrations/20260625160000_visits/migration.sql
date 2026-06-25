-- Analítica básica de visitas a las webs públicas del ecosistema

CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "path" TEXT NOT NULL DEFAULT '/',
    "country" TEXT,
    "referer" TEXT,
    "device" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Visit_site_idx" ON "Visit"("site");
CREATE INDEX "Visit_createdAt_idx" ON "Visit"("createdAt");
