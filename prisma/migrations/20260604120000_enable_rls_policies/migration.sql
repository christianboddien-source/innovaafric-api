-- ============================================================
-- INNOVAAFRIC — Row Level Security (RLS)
-- Migración: 20260604120000_enable_rls_policies
--
-- Estrategia:
--   • Railway/Prisma usa rol `postgres` → bypassea RLS siempre
--   • Frontend (anon key) → solo lee tablas públicas
--   • Datos de usuario → solo accesibles por la API (Railway)
-- ============================================================

-- ──────────────────────────────────────────────
-- 1. ACTIVAR RLS EN TODAS LAS TABLAS
-- ──────────────────────────────────────────────

ALTER TABLE "User"                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Wallet"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Transaction"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GroceryProduct"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CartItem"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItem"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GroceryOrder"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GroceryOrderItem"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Rider"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollRun"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollItem"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Merchant"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiClient"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillProvider"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillPayment"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tontine"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TontineMember"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TontineContribution"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VirtualCard"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VirtualCardTransaction"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Review"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WishlistItem"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Coupon"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoyaltyAccount"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoyaltyHistory"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Referral"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BusinessAccount"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BulkPayment"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BulkPaymentResult"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceItem"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Webhook"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExchangeRate"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProviderCategory"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tax"                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Bank"                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserBankAccount"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Loan"                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatMessage"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Event"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BankTransfer"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailLog"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Campaign"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportTicket"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CountryConfig"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiKey"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccountingEntry"         ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────
-- 2. TABLAS PÚBLICAS — lectura anónima permitida
--    (datos de catálogo, no datos de usuario)
-- ──────────────────────────────────────────────

-- Tasas de cambio (xendermoney las consulta directamente)
CREATE POLICY "public_read_exchange_rates"
  ON "ExchangeRate" FOR SELECT
  TO anon, authenticated
  USING (true);

-- Productos tienda
CREATE POLICY "public_read_products"
  ON "Product" FOR SELECT
  TO anon, authenticated
  USING (true);

-- Productos supermercado
CREATE POLICY "public_read_grocery_products"
  ON "GroceryProduct" FOR SELECT
  TO anon, authenticated
  USING (true);

-- Proveedores de facturas (electricidad, agua…)
CREATE POLICY "public_read_bill_providers"
  ON "BillProvider" FOR SELECT
  TO anon, authenticated
  USING (true);

-- Bancos disponibles
CREATE POLICY "public_read_banks"
  ON "Bank" FOR SELECT
  TO anon, authenticated
  USING (true);

-- Configuración por país
CREATE POLICY "public_read_country_configs"
  ON "CountryConfig" FOR SELECT
  TO anon, authenticated
  USING (true);

-- Categorías de proveedores
CREATE POLICY "public_read_provider_categories"
  ON "ProviderCategory" FOR SELECT
  TO anon, authenticated
  USING (true);

-- Merchants / QR
CREATE POLICY "public_read_merchants"
  ON "Merchant" FOR SELECT
  TO anon, authenticated
  USING (true);

-- Eventos públicos (anuncios, campañas)
CREATE POLICY "public_read_events"
  ON "Event" FOR SELECT
  TO anon, authenticated
  USING (true);

-- ──────────────────────────────────────────────
-- 3. TABLAS SENSIBLES — sin acceso directo anónimo
--    Todo el acceso pasa por la API Railway (postgres)
--    No se crean políticas → DENY por defecto para anon
-- ──────────────────────────────────────────────
-- Cubiertas: User, Wallet, Transaction, CartItem, Order,
-- GroceryOrder, BillPayment, VirtualCard, Notification,
-- Loan, BankTransfer, Invoice, BulkPayment, ChatMessage,
-- LoyaltyAccount, Referral, BusinessAccount, ApiKey,
-- AccountingEntry, EmailLog, PayrollRun, SupportTicket,
-- Webhook, etc.
--
-- El rol `postgres` (usado por Railway/Prisma) tiene
-- BYPASSRLS implícito como superusuario → no necesita políticas.

-- ──────────────────────────────────────────────
-- 4. NOTA DE SEGURIDAD
-- ──────────────────────────────────────────────
-- La SUPABASE_ANON_KEY (clave pública del frontend) solo
-- puede leer las 8 tablas de catálogo listadas arriba.
-- Para cualquier operación con datos de usuario, el frontend
-- debe llamar a https://api.innovaafric.com/api/* con
-- Authorization: Bearer <JWT>, nunca usar Supabase client
-- directamente sobre tablas sensibles.
