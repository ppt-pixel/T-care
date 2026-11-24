CREATE TYPE "ShopOrderStatus" AS ENUM (
  'PENDING_PAYMENT',
  'PAYMENT_REVIEW',
  'PAID',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED'
);

ALTER TABLE "Product"
  ADD COLUMN "careInstructions" TEXT,
  ADD COLUMN "lightRequirements" TEXT,
  ADD COLUMN "wateringFrequency" TEXT,
  ADD COLUMN "safetyNote" TEXT;

CREATE TABLE "StoreSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "shippingFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "taxRateBps" INTEGER NOT NULL DEFAULT 0,
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopOrder" (
  "id" TEXT NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "status" "ShopOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "subtotal" DECIMAL(10,2) NOT NULL,
  "taxRateBps" INTEGER NOT NULL DEFAULT 0,
  "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "shippingFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(10,2) NOT NULL,
  "recipientName" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "recipientPhone" TEXT NOT NULL,
  "addressLine1" TEXT NOT NULL,
  "addressLine2" TEXT,
  "city" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "postalCode" TEXT NOT NULL,
  "country" TEXT NOT NULL DEFAULT 'India',
  "customerNote" TEXT,
  "trackingNumber" TEXT,
  "carrier" TEXT,
  "fulfillmentNote" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "stockReleasedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "shippedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopOrderItem" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" TEXT,
  "productSku" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "imageUrl" TEXT,
  "unitPrice" DECIMAL(10,2) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "lineTotal" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShopOrderItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Payment" ADD COLUMN "shopOrderId" TEXT;
CREATE UNIQUE INDEX "Payment_shopOrderId_key" ON "Payment"("shopOrderId");
CREATE UNIQUE INDEX "ShopOrder_orderNumber_key" ON "ShopOrder"("orderNumber");
CREATE UNIQUE INDEX "ShopOrder_idempotencyKey_key" ON "ShopOrder"("idempotencyKey");
CREATE INDEX "ShopOrder_customerId_createdAt_idx" ON "ShopOrder"("customerId", "createdAt");
CREATE INDEX "ShopOrder_status_createdAt_idx" ON "ShopOrder"("status", "createdAt");
CREATE INDEX "ShopOrder_expiresAt_status_idx" ON "ShopOrder"("expiresAt", "status");
CREATE INDEX "ShopOrderItem_orderId_idx" ON "ShopOrderItem"("orderId");
CREATE INDEX "ShopOrderItem_productId_idx" ON "ShopOrderItem"("productId");

ALTER TABLE "ShopOrder" ADD CONSTRAINT "ShopOrder_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShopOrderItem" ADD CONSTRAINT "ShopOrderItem_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "ShopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopOrderItem" ADD CONSTRAINT "ShopOrderItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_shopOrderId_fkey"
  FOREIGN KEY ("shopOrderId") REFERENCES "ShopOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
