-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'customer',
    "passwordHash" TEXT NOT NULL,
    "kycStatus" TEXT NOT NULL DEFAULT 'pending',
    "kycDocument" TEXT,
    "referralCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balanceEur" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceXaf" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceXof" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipientId" TEXT,
    "amountSent" DOUBLE PRECISION,
    "currencySent" TEXT,
    "amountReceived" DOUBLE PRECISION,
    "currencyReceived" TEXT,
    "fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exchangeRate" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION,
    "currency" TEXT,
    "method" TEXT,
    "destination" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "merchantId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceEur" DOUBLE PRECISION NOT NULL,
    "priceXaf" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "origin" TEXT NOT NULL,
    "ceCertified" BOOLEAN NOT NULL DEFAULT true,
    "deliveryDays" INTEGER NOT NULL DEFAULT 5,
    "ratingAvg" DOUBLE PRECISION,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroceryProduct" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceXaf" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "store" TEXT NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "GroceryProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priceEur" DOUBLE PRECISION NOT NULL,
    "priceXaf" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalEur" DOUBLE PRECISION NOT NULL,
    "totalXaf" DOUBLE PRECISION NOT NULL,
    "paymentCurrency" TEXT NOT NULL,
    "paymentAmount" DOUBLE PRECISION NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "estimatedDelivery" TEXT,
    "trackingId" TEXT NOT NULL,
    "hubLocation" TEXT,
    "loyaltyPointsEarned" INTEGER NOT NULL DEFAULT 0,
    "deliveryProof" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priceEur" DOUBLE PRECISION NOT NULL,
    "priceXaf" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroceryOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalXaf" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "deliveryAddress" TEXT NOT NULL,
    "riderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'preparing',
    "estimatedDelivery" TEXT,
    "deliveryProof" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroceryOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroceryOrderItem" (
    "id" TEXT NOT NULL,
    "groceryOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priceXaf" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "GroceryOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "vehicle" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "rating" DOUBLE PRECISION,
    "deliveriesTotal" INTEGER NOT NULL DEFAULT 0,
    "registeredBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "circularId" TEXT NOT NULL,
    "qrCode" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,

    CONSTRAINT "ApiClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XAF',
    "minAmount" DOUBLE PRECISION NOT NULL,
    "maxAmount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BillProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "confirmationCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tontine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "adminId" TEXT NOT NULL,
    "contributionAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XAF',
    "frequency" TEXT NOT NULL,
    "maxMembers" INTEGER NOT NULL,
    "currentRound" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tontine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TontineMember" (
    "id" TEXT NOT NULL,
    "tontineId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "turn" INTEGER NOT NULL,
    "hasReceived" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TontineMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TontineContribution" (
    "id" TEXT NOT NULL,
    "tontineId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TontineContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirtualCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "cvv" TEXT NOT NULL,
    "expiry" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "spentTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VirtualCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirtualCardTransaction" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VirtualCardTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" TEXT NOT NULL,
    "discountValue" DOUBLE PRECISION NOT NULL,
    "minOrderEur" DOUBLE PRECISION,
    "minOrderXaf" DOUBLE PRECISION,
    "maxUses" INTEGER NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "totalEarned" INTEGER NOT NULL DEFAULT 0,
    "totalRedeemed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LoyaltyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyHistory" (
    "id" TEXT NOT NULL,
    "loyaltyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "refId" TEXT,
    "balanceAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredId" TEXT NOT NULL,
    "bonusAwarded" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessAccount" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "address" TEXT,
    "website" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "plan" TEXT NOT NULL DEFAULT 'basic',
    "monthlyLimitEur" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkPayment" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "businessId" TEXT,
    "companyName" TEXT NOT NULL,
    "description" TEXT,
    "currency" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "recipientsTotal" INTEGER NOT NULL,
    "succeeded" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BulkPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkPaymentResult" (
    "id" TEXT NOT NULL,
    "bulkPaymentId" TEXT NOT NULL,
    "recipientRef" TEXT NOT NULL,
    "recipientName" TEXT,
    "amount" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "reason" TEXT,

    CONSTRAINT "BulkPaymentResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "issuerId" TEXT NOT NULL,
    "issuerName" TEXT NOT NULL,
    "businessId" TEXT,
    "clientId" TEXT,
    "clientName" TEXT NOT NULL,
    "clientEmail" TEXT,
    "currency" TEXT NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "taxRate" DOUBLE PRECISION NOT NULL,
    "taxAmount" DOUBLE PRECISION NOT NULL,
    "totalEur" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "dueDate" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "data" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_userId_productId_key" ON "CartItem"("userId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_trackingId_key" ON "Order"("trackingId");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_qrCode_key" ON "Merchant"("qrCode");

-- CreateIndex
CREATE UNIQUE INDEX "ApiClient_clientId_key" ON "ApiClient"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "TontineMember_tontineId_userId_key" ON "TontineMember"("tontineId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_type_targetId_userId_key" ON "Review"("type", "targetId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistItem_userId_productId_key" ON "WishlistItem"("userId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyAccount_userId_key" ON "LoyaltyAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referredId_key" ON "Referral"("referredId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessAccount_ownerId_key" ON "BusinessAccount"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_pair_key" ON "ExchangeRate"("pair");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryOrder" ADD CONSTRAINT "GroceryOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryOrder" ADD CONSTRAINT "GroceryOrder_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryOrderItem" ADD CONSTRAINT "GroceryOrderItem_groceryOrderId_fkey" FOREIGN KEY ("groceryOrderId") REFERENCES "GroceryOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryOrderItem" ADD CONSTRAINT "GroceryOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "GroceryProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillPayment" ADD CONSTRAINT "BillPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillPayment" ADD CONSTRAINT "BillPayment_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "BillProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TontineMember" ADD CONSTRAINT "TontineMember_tontineId_fkey" FOREIGN KEY ("tontineId") REFERENCES "Tontine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TontineMember" ADD CONSTRAINT "TontineMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TontineContribution" ADD CONSTRAINT "TontineContribution_tontineId_fkey" FOREIGN KEY ("tontineId") REFERENCES "Tontine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VirtualCard" ADD CONSTRAINT "VirtualCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VirtualCardTransaction" ADD CONSTRAINT "VirtualCardTransaction_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "VirtualCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyHistory" ADD CONSTRAINT "LoyaltyHistory_loyaltyId_fkey" FOREIGN KEY ("loyaltyId") REFERENCES "LoyaltyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredId_fkey" FOREIGN KEY ("referredId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessAccount" ADD CONSTRAINT "BusinessAccount_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkPayment" ADD CONSTRAINT "BulkPayment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkPayment" ADD CONSTRAINT "BulkPayment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "BusinessAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkPaymentResult" ADD CONSTRAINT "BulkPaymentResult_bulkPaymentId_fkey" FOREIGN KEY ("bulkPaymentId") REFERENCES "BulkPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paidBy_fkey" FOREIGN KEY ("paidBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "BusinessAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
