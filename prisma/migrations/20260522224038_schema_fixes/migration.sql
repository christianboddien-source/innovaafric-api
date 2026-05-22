/*
  Warnings:

  - You are about to drop the column `category` on the `BillPayment` table. All the data in the column will be lost.
  - You are about to drop the column `providerName` on the `BillPayment` table. All the data in the column will be lost.
  - You are about to drop the column `monthlyLimit` on the `BusinessAccount` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `CartItem` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `GroceryOrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `subtotal` on the `GroceryOrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `OrderItem` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "GroceryOrder" ADD COLUMN "deliveryProof" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "deliveryProof" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "kycDocument" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BillPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "confirmationCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BillPayment_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "BillProvider" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BillPayment" ("amount", "confirmationCode", "createdAt", "currency", "id", "note", "providerId", "referenceNumber", "status", "userId") SELECT "amount", "confirmationCode", "createdAt", "currency", "id", "note", "providerId", "referenceNumber", "status", "userId" FROM "BillPayment";
DROP TABLE "BillPayment";
ALTER TABLE "new_BillPayment" RENAME TO "BillPayment";
CREATE TABLE "new_BusinessAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "address" TEXT,
    "website" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "plan" TEXT NOT NULL DEFAULT 'basic',
    "monthlyLimitEur" REAL NOT NULL DEFAULT 10000,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BusinessAccount_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BusinessAccount" ("address", "companyName", "country", "createdAt", "id", "industry", "ownerId", "plan", "status", "taxId", "updatedAt", "website") SELECT "address", "companyName", "country", "createdAt", "id", "industry", "ownerId", "plan", "status", "taxId", "updatedAt", "website" FROM "BusinessAccount";
DROP TABLE "BusinessAccount";
ALTER TABLE "new_BusinessAccount" RENAME TO "BusinessAccount";
CREATE UNIQUE INDEX "BusinessAccount_ownerId_key" ON "BusinessAccount"("ownerId");
CREATE TABLE "new_CartItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priceEur" REAL NOT NULL,
    "priceXaf" REAL NOT NULL,
    CONSTRAINT "CartItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CartItem" ("id", "priceEur", "priceXaf", "productId", "quantity", "userId") SELECT "id", "priceEur", "priceXaf", "productId", "quantity", "userId" FROM "CartItem";
DROP TABLE "CartItem";
ALTER TABLE "new_CartItem" RENAME TO "CartItem";
CREATE UNIQUE INDEX "CartItem_userId_productId_key" ON "CartItem"("userId", "productId");
CREATE TABLE "new_GroceryOrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groceryOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priceXaf" REAL NOT NULL,
    CONSTRAINT "GroceryOrderItem_groceryOrderId_fkey" FOREIGN KEY ("groceryOrderId") REFERENCES "GroceryOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GroceryOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "GroceryProduct" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_GroceryOrderItem" ("groceryOrderId", "id", "priceXaf", "productId", "quantity") SELECT "groceryOrderId", "id", "priceXaf", "productId", "quantity" FROM "GroceryOrderItem";
DROP TABLE "GroceryOrderItem";
ALTER TABLE "new_GroceryOrderItem" RENAME TO "GroceryOrderItem";
CREATE TABLE "new_OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priceEur" REAL NOT NULL,
    "priceXaf" REAL NOT NULL,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_OrderItem" ("id", "orderId", "priceEur", "priceXaf", "productId", "quantity") SELECT "id", "orderId", "priceEur", "priceXaf", "productId", "quantity" FROM "OrderItem";
DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
