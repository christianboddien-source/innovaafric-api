-- ============================================================
-- INNOVAAFRIC — Business models migration
-- 20260604140000_add_business_models
-- ============================================================

-- Partner
CREATE TABLE "Partner" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "type"      TEXT NOT NULL,
    "country"   TEXT NOT NULL,
    "contact"   TEXT,
    "phone"     TEXT,
    "share"     DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "status"    TEXT NOT NULL DEFAULT 'activo',
    "joinedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- PartnerInvoice
CREATE TABLE "PartnerInvoice" (
    "id"        TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "amount"    DOUBLE PRECISION NOT NULL,
    "currency"  TEXT NOT NULL DEFAULT 'XAF',
    "period"    TEXT NOT NULL,
    "dueDate"   TIMESTAMP(3) NOT NULL,
    "status"    TEXT NOT NULL DEFAULT 'pendiente',
    "notes"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PartnerInvoice_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "PartnerInvoice" ADD CONSTRAINT "PartnerInvoice_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreditScore
CREATE TABLE "CreditScore" (
    "id"              TEXT NOT NULL,
    "userId"          TEXT NOT NULL,
    "score"           INTEGER NOT NULL DEFAULT 500,
    "rating"          TEXT NOT NULL DEFAULT 'C',
    "historyMonths"   INTEGER NOT NULL DEFAULT 0,
    "onTimePayments"  INTEGER NOT NULL DEFAULT 0,
    "defaults"        INTEGER NOT NULL DEFAULT 0,
    "txCount"         INTEGER NOT NULL DEFAULT 0,
    "approved"        BOOLEAN NOT NULL DEFAULT false,
    "notes"           TEXT,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditScore_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CreditScore_userId_key" ON "CreditScore"("userId");
ALTER TABLE "CreditScore" ADD CONSTRAINT "CreditScore_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Installment
CREATE TABLE "Installment" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "total"       DOUBLE PRECISION NOT NULL,
    "currency"    TEXT NOT NULL DEFAULT 'XAF',
    "paid"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "months"      INTEGER NOT NULL,
    "monthlyFee"  DOUBLE PRECISION NOT NULL,
    "nextDueDate" TIMESTAMP(3),
    "status"      TEXT NOT NULL DEFAULT 'activo',
    "notes"       TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- InsurancePlan
CREATE TABLE "InsurancePlan" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "coverage"    DOUBLE PRECISION NOT NULL,
    "premium"     DOUBLE PRECISION NOT NULL,
    "currency"    TEXT NOT NULL DEFAULT 'XAF',
    "duration"    INTEGER NOT NULL,
    "provider"    TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'activo',
    "subscribers" INTEGER NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InsurancePlan_pkey" PRIMARY KEY ("id")
);

-- InsuranceClaim
CREATE TABLE "InsuranceClaim" (
    "id"          TEXT NOT NULL,
    "planId"      TEXT NOT NULL,
    "userId"      TEXT,
    "userEmail"   TEXT NOT NULL,
    "amount"      DOUBLE PRECISION NOT NULL,
    "currency"    TEXT NOT NULL DEFAULT 'XAF',
    "description" TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'pendiente',
    "notes"       TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InsuranceClaim_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "InsurancePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- InvestmentFund
CREATE TABLE "InvestmentFund" (
    "id"             TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "category"       TEXT NOT NULL,
    "target"         DOUBLE PRECISION NOT NULL,
    "raised"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency"       TEXT NOT NULL DEFAULT 'XAF',
    "minInvest"      DOUBLE PRECISION NOT NULL DEFAULT 25000,
    "returnRate"     DOUBLE PRECISION NOT NULL DEFAULT 8.0,
    "durationMonths" INTEGER NOT NULL DEFAULT 24,
    "status"         TEXT NOT NULL DEFAULT 'activo',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InvestmentFund_pkey" PRIMARY KEY ("id")
);

-- FundInvestment
CREATE TABLE "FundInvestment" (
    "id"        TEXT NOT NULL,
    "fundId"    TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "amount"    DOUBLE PRECISION NOT NULL,
    "currency"  TEXT NOT NULL DEFAULT 'XAF',
    "status"    TEXT NOT NULL DEFAULT 'activo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FundInvestment_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "FundInvestment" ADD CONSTRAINT "FundInvestment_fundId_fkey"
  FOREIGN KEY ("fundId") REFERENCES "InvestmentFund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FundInvestment" ADD CONSTRAINT "FundInvestment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SavingsGoal
CREATE TABLE "SavingsGoal" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "target"    DOUBLE PRECISION NOT NULL,
    "current"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency"  TEXT NOT NULL DEFAULT 'XAF',
    "deadline"  TIMESTAMP(3),
    "autoSave"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status"    TEXT NOT NULL DEFAULT 'activo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- WhiteLabelInstance
CREATE TABLE "WhiteLabelInstance" (
    "id"           TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "partnerId"    TEXT,
    "domain"       TEXT NOT NULL,
    "colorPrimary" TEXT NOT NULL DEFAULT '#00AEEF',
    "status"       TEXT NOT NULL DEFAULT 'activo',
    "notes"        TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhiteLabelInstance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhiteLabelInstance_domain_key" ON "WhiteLabelInstance"("domain");

-- RefundRequest
CREATE TABLE "RefundRequest" (
    "id"           TEXT NOT NULL,
    "orderId"      TEXT,
    "userId"       TEXT,
    "userEmail"    TEXT NOT NULL,
    "merchantName" TEXT,
    "amount"       DOUBLE PRECISION NOT NULL,
    "currency"     TEXT NOT NULL DEFAULT 'XAF',
    "reason"       TEXT NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'pendiente',
    "notes"        TEXT,
    "processedBy"  TEXT,
    "processedAt"  TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

-- MerchantProfile
CREATE TABLE "MerchantProfile" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "category"  TEXT NOT NULL,
    "country"   TEXT NOT NULL,
    "city"      TEXT,
    "contact"   TEXT,
    "phone"     TEXT,
    "currency"  TEXT NOT NULL DEFAULT 'XAF',
    "status"    TEXT NOT NULL DEFAULT 'activo',
    "joinedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MerchantProfile_pkey" PRIMARY KEY ("id")
);

-- Enable RLS on all new tables
ALTER TABLE "Partner"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartnerInvoice"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreditScore"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Installment"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InsurancePlan"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InsuranceClaim"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvestmentFund"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FundInvestment"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavingsGoal"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhiteLabelInstance"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefundRequest"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MerchantProfile"     ENABLE ROW LEVEL SECURITY;

-- Public read for insurance plans and investment funds (catalog data)
CREATE POLICY "public_read_insurance_plans"
  ON "InsurancePlan" FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "public_read_investment_funds"
  ON "InvestmentFund" FOR SELECT TO anon, authenticated USING (true);
