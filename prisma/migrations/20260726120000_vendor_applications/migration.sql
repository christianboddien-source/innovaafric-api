-- Pipeline de alta de comercios (onboarding con validación humana + contrato).
CREATE TABLE "VendorApplication" (
    "id"                    TEXT NOT NULL,
    "businessName"          TEXT NOT NULL,
    "email"                 TEXT NOT NULL,
    "phone"                 TEXT,
    "country"               TEXT,
    "city"                  TEXT,
    "sector"                TEXT,
    "profile"               TEXT NOT NULL DEFAULT 'comprador',
    "plan"                  TEXT,
    "monthlyVolume"         TEXT,
    "paymentMethod"         TEXT,
    "deliveryOption"        TEXT,
    "message"               TEXT,
    "status"                TEXT NOT NULL DEFAULT 'pending',
    "contractToken"         TEXT,
    "contractSentAt"        TIMESTAMP(3),
    "contractAcceptedAt"    TIMESTAMP(3),
    "acceptedIp"            TEXT,
    "acceptedUserAgent"     TEXT,
    "reviewedBy"            TEXT,
    "reviewedAt"            TIMESTAMP(3),
    "rejectedReason"        TEXT,
    "provisionedUserId"     TEXT,
    "provisionedMerchantId" TEXT,
    "provisionedAt"         TIMESTAMP(3),
    "source"                TEXT NOT NULL DEFAULT 'xenderbigshop',
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VendorApplication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorApplication_contractToken_key" ON "VendorApplication"("contractToken");
CREATE INDEX "VendorApplication_status_idx" ON "VendorApplication"("status");
CREATE INDEX "VendorApplication_email_idx"  ON "VendorApplication"("email");
