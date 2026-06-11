-- App del Comercio: enlace Merchant↔User y comercio en las comandas

-- Merchant: datos de comercio + login
ALTER TABLE "Merchant" ALTER COLUMN "circularId" DROP NOT NULL;
ALTER TABLE "Merchant" ADD COLUMN "userId" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "phone" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "address" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "city" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "country" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "category" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "Merchant_userId_key" ON "Merchant"("userId");

-- GroceryOrder: comercio que prepara la comanda
ALTER TABLE "GroceryOrder" ADD COLUMN "merchantId" TEXT;
